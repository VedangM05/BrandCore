import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { trace, SpanStatusCode, Span } from '@opentelemetry/api';
import { generateImage, fetchSiteImage, GeneratedImage } from './image.service';
import { compositeHeadlineOnImage, normalizeImage } from './composite.service';
import { resolveBrandDna } from './brandDna.service';
import { runImageBrandQaNode, ImageQaResult, getCachedOrGenerateCopyAndArt } from './creative.service';
import { createAsset, AssetRecord } from './asset.service';
import { query } from '../db';

const tracer = trace.getTracer('brandcore-photoshoot-pipeline');

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

function ensureUploadsDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

function saveBufferToUploads(buffer: Buffer, extension: string): string {
  ensureUploadsDir();
  const fileName = `${crypto.randomUUID()}.${extension}`;
  const filePath = path.join(UPLOADS_DIR, fileName);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

const STYLE_PROMPT_HINTS: Record<string, string> = {
  Studio: 'clean studio backdrop, softbox lighting, product-focused, minimal shadows',
  Ingredient: 'flat-lay of raw ingredients or components surrounding the product, editorial food/product photography style',
  'In Use': 'lifestyle scene of a person actively using the product in a natural setting, candid framing',
  Contextual: 'the product placed in its real-world environment with contextual props, warm ambient lighting',
};

// Generation-time aspect ratio presets - picked before generating (rather
// than only cropped after, in AssetEditor) so composition/headline space is
// actually designed for the target frame instead of squeezed into it later.
// 'portrait' (1080x1350) matches the carousel's long-standing default, kept
// unchanged so existing behavior doesn't shift for callers that omit aspect.
export type GenerationAspect = 'square' | 'portrait' | 'story';
const GENERATION_DIMENSIONS: Record<GenerationAspect, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
};

function resolveGenerationDimensions(
  aspect: string | undefined,
  fallback: GenerationAspect
): { width: number; height: number } {
  return GENERATION_DIMENSIONS[(aspect as GenerationAspect) || fallback] || GENERATION_DIMENSIONS[fallback];
}

function buildBrandVisualPrefix(brandDna: any): string {
  const brandName = brandDna.title || brandDna.domain || '';
  const colors: string[] = brandDna.colors || [];
  const colorPhrase = colors.length > 0 ? `a color palette echoing ${colors.slice(0, 3).join(', ')}` : 'a neutral, premium color palette';
  let prefix = `Professional commercial photography for the brand "${brandName}", ${colorPhrase}.`;
  // Previously only title/colors made it into the visual prompt despite
  // tone/mission/audience already being scanned and sitting unused right
  // here - a "playful, irreverent" brand and a "clinical, precise" one got
  // the exact same generic photography direction. Kept short (one clause
  // each) since this is steering visual mood, not writing more copy.
  if (brandDna.tone) {
    prefix += ` The visual mood should feel ${brandDna.tone}.`;
  }
  if (brandDna.audience) {
    prefix += ` Shot with this brand's actual audience in mind: ${brandDna.audience}.`;
  }
  return prefix;
}

// Image models render text unreliably (garbled signage, mangled letters), so every
// generated background explicitly excludes it - any real copy is composited
// server-side afterward by composite.service.ts instead.
const NO_TEXT_DIRECTIVE =
  'Do not render any text, words, letters, numbers, signage, labels, or logos anywhere in the image - no readable characters of any kind. Pure photography only.';

// Bounded per the spec doc's Fix #2: a fixed number of attempts up front,
// falling back to the best-scoring one, rather than an open-ended retry loop.
const MAX_IMAGE_ATTEMPTS = 2;

interface ImageAttempt {
  generated: GeneratedImage;
  qa: ImageQaResult;
}

interface SiteImage {
  url: string;
  alt: string;
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'on', 'in', 'with', 'for', 'and', 'to', 'at',
  'is', 'it', 'this', 'that', 'our', 'your', 'from', 'by',
]);

function significantWords(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

/**
 * Best-effort keyword overlap between the requested scene and a candidate
 * site image's alt text - deliberately a cheap heuristic, not semantic/
 * vision matching (Pollinations has no image-to-image capability, and
 * running every request through Gemini vision just to pick a candidate
 * would add real latency/cost for a "nice to have" match). Requires at
 * least 2 shared significant words (or 1 when the alt text itself is very
 * short) so a single generic overlap like "product" doesn't misfire on
 * every request - false negatives (falling through to generation) are the
 * safe failure mode here, not false positives.
 */
export function findMatchingSiteImage(matchText: string, siteImages: SiteImage[] | undefined): SiteImage | null {
  if (!siteImages || siteImages.length === 0) return null;
  const requestWords = significantWords(matchText);
  if (requestWords.size === 0) return null;

  let best: SiteImage | null = null;
  let bestScore = 0;
  for (const img of siteImages) {
    if (!img.alt) continue;
    const altWords = significantWords(img.alt);
    if (altWords.size === 0) continue;
    let overlap = 0;
    for (const w of requestWords) if (altWords.has(w)) overlap++;
    const threshold = altWords.size <= 3 ? 1 : 2;
    if (overlap >= threshold && overlap > bestScore) {
      bestScore = overlap;
      best = img;
    }
  }
  return best;
}

/**
 * Generates an image and runs it through Brand QA (runImageBrandQaNode).
 * Previously photoshoot.service.ts had no QA step at all - a garbled or
 * off-brand Pollinations render shipped straight to the asset library with
 * no check, unlike the text pipeline's bounded-retry-plus-best-of-N in
 * creative.service.ts. This mirrors that same pattern for images: try up to
 * MAX_IMAGE_ATTEMPTS times, return as soon as one passes, and fall back to
 * whichever attempt scored highest if none did - a fixed, predictable cost
 * ceiling per generation instead of retrying indefinitely.
 *
 * Before generating anything: if the brand's own scanned site already has a
 * real image that plausibly matches what's being asked for
 * (findMatchingSiteImage against brandDna.site_images), use that real asset
 * directly instead of fabricating one - a real product photo beats an
 * AI-generated approximation of it. `matchText` is the raw, pre-AI-enriched
 * scene description (not the fully styled generation prompt) since that's
 * what a human-written alt text is actually likely to resemble; falls back
 * to matching against `prompt` itself when the caller has nothing shorter.
 * A matched image that fails to fetch (dead link, timeout) falls through to
 * normal generation rather than failing the request.
 */
async function generateBrandQaApprovedImage(
  prompt: string,
  width: number,
  height: number,
  brandDna: any,
  seedBase?: number,
  matchText?: string
): Promise<ImageAttempt> {
  const match = findMatchingSiteImage(matchText || prompt, brandDna?.site_images);
  if (match) {
    try {
      const generated = await fetchSiteImage(match.url, width, height);
      return {
        generated,
        qa: {
          isApproved: true,
          score: 100,
          feedback: `Used the brand's own existing image (matched alt text: "${match.alt}") instead of generating one.`,
        },
      };
    } catch (err: any) {
      console.warn('[Photoshoot] Matched site image failed to fetch, falling back to generation:', err.message);
    }
  }

  const baseSeed = seedBase ?? Math.floor(Math.random() * 1_000_000);
  const attempts: ImageAttempt[] = [];

  for (let i = 0; i < MAX_IMAGE_ATTEMPTS; i++) {
    const generated = await generateImage({ prompt, width, height, seed: baseSeed + i * 7919 });
    const qa = await runImageBrandQaNode(generated.buffer, brandDna, generated.mimeType);
    const attempt: ImageAttempt = { generated, qa };
    attempts.push(attempt);
    if (qa.isApproved) return attempt;
  }

  return attempts.reduce((best, cur) => (cur.qa.score > best.qa.score ? cur : best));
}

export interface PhotoshootImageResult {
  asset: AssetRecord;
  prompt: string;
  brandDnaId: string | null;
}

/**
 * Generates a single on-brand scene image (no text overlay) and saves it to
 * the asset library. This is the "AI Photoshoot" single-image flow.
 */
export async function generatePhotoshootImage(
  brandDnaId: string,
  scenePrompt: string,
  style: string,
  aspect: string | undefined,
  userId: string
): Promise<PhotoshootImageResult> {
  return tracer.startActiveSpan('generatePhotoshootImage', async (span: Span) => {
    try {
      const { brandDna, validDnaId } = await resolveBrandDna(brandDnaId, userId);
      const styleHint = STYLE_PROMPT_HINTS[style] || STYLE_PROMPT_HINTS.Studio;
      const fullPrompt = `${buildBrandVisualPrefix(brandDna)} Scene: ${scenePrompt}. Style: ${styleHint}. ${NO_TEXT_DIRECTIVE}`;
      // Default stays the original 1024x1024 (not the 1080 generation-preset
      // grid) when no aspect is given, so existing callers see no behavior change.
      const { width, height } = aspect ? resolveGenerationDimensions(aspect, 'square') : { width: 1024, height: 1024 };

      span.setAttribute('photoshoot.style', style);
      span.setAttribute('photoshoot.brand_dna_id', validDnaId || 'none');
      span.setAttribute('photoshoot.aspect', aspect || 'default');

      const { generated, qa } = await generateBrandQaApprovedImage(fullPrompt, width, height, brandDna, undefined, scenePrompt);
      const normalized = await normalizeImage(generated.buffer, width, height);
      const filePath = saveBufferToUploads(normalized, 'jpg');

      const asset = await createAsset({
        userId,
        brandDnaId: validDnaId,
        campaignId: null,
        name: `Photoshoot - ${style} - ${scenePrompt.slice(0, 60)}`,
        type: 'image',
        filePath,
        mimeType: 'image/jpeg',
        fileSize: normalized.length,
        tags: ['photoshoot', style.toLowerCase().replace(/\s+/g, '-')],
        metaData: { style, scenePrompt, provider: generated.provider, model: generated.model, qaScore: qa.score, qaFeedback: qa.feedback },
      });

      span.setAttribute('photoshoot.qa_score', qa.score);
      span.setStatus({ code: SpanStatusCode.OK });
      return { asset, prompt: fullPrompt, brandDnaId: validDnaId };
    } catch (error: any) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  });
}

export interface CampaignPostResult {
  campaignId: string;
  asset: AssetRecord;
  headline: string;
  bodyText: string;
  socialCopy: string;
  accentColor?: string;
  eyebrow?: string;
  // The text-free background, returned inline so the frontend editor can render
  // the headline as a live, movable/editable layer instead of already-flattened
  // pixels. The saved asset itself still gets the flattened version below, so
  // it's immediately usable in the library/download even if never edited.
  rawBackgroundDataUrl: string;
}

/**
 * Generates a full campaign post: copywriter headline/body, an art-directed
 * background image, and the headline composited onto it - a single
 * ready-to-publish social asset.
 */
export async function generateCampaignPost(
  brandDnaId: string,
  prompt: string,
  channel: string | undefined,
  aspect: string | undefined,
  userId: string
): Promise<CampaignPostResult> {
  return tracer.startActiveSpan('generateCampaignPost', async (span: Span) => {
    try {
      const { brandDna, validDnaId } = await resolveBrandDna(brandDnaId, userId);
      const { width, height } = resolveGenerationDimensions(aspect, 'square');
      span.setAttribute('photoshoot.aspect', aspect || 'square');

      const { copy, art, cacheHit, cacheType } = await getCachedOrGenerateCopyAndArt(
        userId,
        validDnaId,
        brandDna,
        prompt,
        channel,
        '/api/photoshoot/post'
      );
      span.setAttribute('cache.hit', cacheHit);
      if (cacheHit) span.setAttribute('cache.type', cacheType || 'unknown');

      const brandPrefix = buildBrandVisualPrefix(brandDna);
      const imagePrompt = `${brandPrefix} ${art.imagePrompt} ${NO_TEXT_DIRECTIVE} The headline text will be composited on afterward - the generated scene itself must stay completely text-free.`;

      const { generated, qa } = await generateBrandQaApprovedImage(imagePrompt, width, height, brandDna, undefined, prompt);
      const rawBackground = await normalizeImage(generated.buffer, width, height);
      const eyebrow = brandDna.title || brandDna.domain || undefined;
      const accentColor = (brandDna.colors || [])[0];

      const composited = await compositeHeadlineOnImage(generated.buffer, {
        headline: copy.headline,
        eyebrow,
        accentColor,
        width,
        height,
      });

      const filePath = saveBufferToUploads(composited, 'jpg');
      // Persisted separately from the flattened asset so the editor can be
      // reopened later (from the Asset Library) with the text-free background
      // still available - see resolveAssetEditorBackground / GET
      // /api/assets/:id/raw-background.
      const rawBackgroundPath = saveBufferToUploads(rawBackground, 'jpg');

      const campaignRes = await query(
        `INSERT INTO campaigns
        (brand_dna_id, prompt, headline, body_text, social_copy, image_prompt, visual_style, qa_score, qa_feedback, attempts, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [validDnaId, prompt, copy.headline, copy.bodyText, copy.socialCopy, art.imagePrompt, art.visualStyle, qa.score, qa.feedback, 1, userId]
      );
      const campaignId = campaignRes.rows[0].id;

      const asset = await createAsset({
        userId,
        brandDnaId: validDnaId,
        campaignId,
        name: `Campaign post - ${copy.headline.slice(0, 60)}`,
        type: 'banner',
        filePath,
        mimeType: 'image/jpeg',
        fileSize: composited.length,
        tags: ['campaign-post', channel ? channel.toLowerCase().replace(/\s+/g, '-') : 'general'],
        metaData: {
          channel,
          headline: copy.headline,
          eyebrow,
          accentColor,
          provider: generated.provider,
          model: generated.model,
          rawBackgroundPath,
          qaScore: qa.score,
          qaFeedback: qa.feedback,
        },
      });

      span.setAttribute('photoshoot.qa_score', qa.score);
      span.setStatus({ code: SpanStatusCode.OK });
      return {
        campaignId,
        asset,
        headline: copy.headline,
        bodyText: copy.bodyText,
        socialCopy: copy.socialCopy,
        accentColor,
        eyebrow,
        rawBackgroundDataUrl: `data:image/jpeg;base64,${rawBackground.toString('base64')}`,
      };
    } catch (error: any) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  });
}

export interface CarouselSlide {
  slideIndex: number;
  headline: string;
  bodyText: string;
  eyebrow: string;
  accentColor?: string;
  asset: AssetRecord;
  rawBackgroundDataUrl: string;
}

export interface CarouselResult {
  carouselId: string;
  slides: CarouselSlide[];
}

const SLIDE_ANGLES = [
  'a bold, attention-grabbing opening hook',
  "the core value proposition and why it matters to the audience",
  'a standout feature or benefit, told concretely',
  'social proof or credibility framing',
  'a clear, direct call to action to close the story',
];

/**
 * Generates a multi-slide carousel post. Each slide gets its own headline
 * (via the copywriter node, angled per slide) and its own generated +
 * text-composited image. Images are generated sequentially - the free image
 * provider throttles unauthenticated requests, so parallel requests would
 * just fail and retry into each other.
 */
export async function generateCarousel(
  brandDnaId: string,
  prompt: string,
  slideCount: number | undefined,
  aspect: string | undefined,
  userId: string
): Promise<CarouselResult> {
  return tracer.startActiveSpan('generateCarousel', async (span: Span) => {
    try {
      const clampedCount = Math.max(2, Math.min(6, slideCount ?? 4));
      const { brandDna, validDnaId } = await resolveBrandDna(brandDnaId, userId);
      const carouselId = crypto.randomUUID();
      const brandPrefix = buildBrandVisualPrefix(brandDna);
      const { width, height } = resolveGenerationDimensions(aspect, 'portrait');

      span.setAttribute('carousel.slide_count', clampedCount);
      span.setAttribute('carousel.brand_dna_id', validDnaId || 'none');
      span.setAttribute('carousel.aspect', aspect || 'portrait');

      const slides: CarouselSlide[] = [];

      for (let i = 0; i < clampedCount; i++) {
        const angle = SLIDE_ANGLES[i % SLIDE_ANGLES.length];
        const slidePrompt = `${prompt} - slide ${i + 1} of ${clampedCount}, focused on: ${angle}`;

        const { copy, art } = await getCachedOrGenerateCopyAndArt(
          userId,
          validDnaId,
          brandDna,
          slidePrompt,
          undefined,
          '/api/photoshoot/carousel'
        );

        const imagePrompt = `${brandPrefix} ${art.imagePrompt} ${NO_TEXT_DIRECTIVE} The headline text will be composited on afterward - the generated scene itself must stay completely text-free.`;
        const { generated, qa } = await generateBrandQaApprovedImage(imagePrompt, width, height, brandDna, i * 7919, slidePrompt);
        const rawBackground = await normalizeImage(generated.buffer, width, height);
        const eyebrow = `${i + 1} / ${clampedCount}`;
        const accentColor = (brandDna.colors || [])[0];

        const composited = await compositeHeadlineOnImage(generated.buffer, {
          headline: copy.headline,
          eyebrow,
          accentColor,
          width,
          height,
        });

        const filePath = saveBufferToUploads(composited, 'jpg');
        const rawBackgroundPath = saveBufferToUploads(rawBackground, 'jpg');

        const asset = await createAsset({
          userId,
          brandDnaId: validDnaId,
          campaignId: null,
          name: `Carousel slide ${i + 1}/${clampedCount} - ${copy.headline.slice(0, 50)}`,
          type: 'carousel_slide',
          filePath,
          mimeType: 'image/jpeg',
          fileSize: composited.length,
          tags: ['carousel', `carousel-${carouselId}`],
          metaData: {
            carouselId,
            slideIndex: i,
            totalSlides: clampedCount,
            headline: copy.headline,
            bodyText: copy.bodyText,
            eyebrow,
            accentColor,
            rawBackgroundPath,
            qaScore: qa.score,
            qaFeedback: qa.feedback,
          },
        });

        slides.push({
          slideIndex: i,
          headline: copy.headline,
          bodyText: copy.bodyText,
          eyebrow,
          accentColor,
          asset,
          rawBackgroundDataUrl: `data:image/jpeg;base64,${rawBackground.toString('base64')}`,
        });
      }

      span.setStatus({ code: SpanStatusCode.OK });
      return { carouselId, slides };
    } catch (error: any) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  });
}
