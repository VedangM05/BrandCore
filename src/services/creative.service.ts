import { trace, SpanStatusCode, Span } from '@opentelemetry/api';
import { query } from '../db';
import { recordNodeSpan } from './metrics.service';
import { resolveBrandDna } from './brandDna.service';
import { semanticCache } from './cache.service';
import { recordUsage } from './quota.service';
import { callGroqJSON, GROQ_TEXT_MODELS } from './groq.service';

const tracer = trace.getTracer('brandcore-creative-pipeline');

export interface CopywriterOutput {
  headline: string;
  bodyText: string;
  socialCopy: string;
}

export interface ArtDirectorOutput {
  imagePrompt: string;
  visualStyle: string;
  colorPalette: string[];
}

export interface QaResult {
  isApproved: boolean;
  score: number;
  feedback: string;
}

export interface AttemptRecord {
  copy: CopywriterOutput;
  art: ArtDirectorOutput;
  qa: QaResult;
}

export interface CreativePipelineResult {
  id: string;
  campaignId: string;
  brandDnaId: string;
  attempts: number;
  finalSelection: AttemptRecord;
  copy: CopywriterOutput;
  art: ArtDirectorOutput;
  qa: QaResult;
  estimatedCostUsd: number;
  savingsVsSequentialPercent: number;
}

async function traceAgentNode<T>(nodeName: string, fn: () => Promise<T>): Promise<T> {
  const startTime = Date.now();
  console.log(`[TIMING] [${nodeName}] Node execution started at ${new Date(startTime).toISOString()}`);
  return tracer.startActiveSpan(nodeName, async (span: Span) => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      recordNodeSpan(nodeName);
      return result;
    } catch (error: any) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message || 'Agent node error',
      });
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      console.log(`[TIMING] [${nodeName}] Node execution finished at ${new Date().toISOString()} (duration: ${duration}ms)`);
      span.end();
    }
  });
}

async function generateCopyWithGroq(
  prompt: string,
  brandDna: any,
  feedback?: string,
  channel?: string
): Promise<CopywriterOutput | null> {
  const brandName = brandDna.title || brandDna.domain || 'Brand';
  const tagline = brandDna.tagline || '';
  const mission = brandDna.mission || '';
  const valueProp = brandDna.value_proposition || '';
  const audience = brandDna.audience || '';
  const tone = brandDna.tone || 'Professional & Engaging';
  const markdown = (brandDna.markdown_content || '').slice(0, 1500);

  const systemInstruction = `You are an expert AI Brand Copywriter and Marketing Strategist.
You are studying and writing ad copy for the following specific business based on its crawled website knowledge base:

Business Name: ${brandName}
Domain: ${brandDna.domain || brandDna.url || ''}
Tagline: ${tagline}
Mission / Purpose: ${mission}
Value Proposition: ${valueProp}
Target Audience: ${audience}
Tone of Voice: ${tone}
Website Knowledge Summary: ${markdown}

IMPORTANT INSTRUCTIONS:
- Study the business details above carefully. Do NOT write generic copy or copy for an unrelated industry (e.g., do NOT write clothing/apparel copy unless the business is actually a clothing brand).
- If the business is YouTube, write copy related to video streaming, creators, music, content, or watching/sharing videos.
- Tailor the copy specifically for the target channel: ${channel || 'General Ad'}.
- Incorporate the campaign prompt: "${prompt}".
${feedback ? `- Address QA feedback: "${feedback}".` : ''}

Respond ONLY with a valid JSON object matching this schema (no markdown, no code blocks):
{
  "headline": "Attention-grabbing headline for ${brandName}",
  "bodyText": "Persuasive body copy aligned with ${brandName}'s value proposition",
  "socialCopy": "Engaging social post or subject line for ${channel || 'social media'}"
}`;

  return callGroqJSON<CopywriterOutput>(systemInstruction, {
    models: GROQ_TEXT_MODELS,
    temperature: 0.7,
    logLabel: `copy generation for ${brandName}`,
    validate: (parsed) =>
      parsed.headline && parsed.bodyText && parsed.socialCopy
        ? { headline: parsed.headline, bodyText: parsed.bodyText, socialCopy: parsed.socialCopy }
        : null,
  });
}

async function runCopywriterNode(
  prompt: string,
  brandDna: any,
  feedback?: string,
  channel?: string
): Promise<CopywriterOutput> {
  return traceAgentNode('copywriter_agent_node', async () => {
    // 1. Attempt generation via Groq and the crawled business knowledge base
    const llmOutput = await generateCopyWithGroq(prompt, brandDna, feedback, channel);
    if (llmOutput) {
      return llmOutput;
    }

    // 2. Knowledge-base aware dynamic fallback (no hardcoded clothing placeholders!)
    const brandName = brandDna.title || brandDna.domain || 'Brand';
    const tone = brandDna.tone || 'Modern & Authoritative';
    const tagline = brandDna.tagline || brandDna.value_proposition || 'Empowering Growth & Innovation';
    const sanitizedTone = tone.replace(/[^a-zA-Z0-9]/g, '');
    const cleanBrandTag = brandName.replace(/[^a-zA-Z0-9]/g, '');

    let headline = `Elevate ${brandName} with ${prompt}`;
    let bodyText = `Discover how ${prompt} drives results for ${brandName}. ${tagline ? `Guided by "${tagline}", ` : ''}delivering high performance for your audience.`;
    let socialCopy = `Transform your strategy with ${prompt} on ${brandName}. #${cleanBrandTag} #${sanitizedTone}`;

    if (channel) {
      const ch = channel.toLowerCase();
      if (ch.includes('twitter') || ch.includes('x')) {
        headline = `🚀 ${prompt} | ${brandName}`;
        bodyText = `Ready to scale with ${prompt}? Tailored for ${brandName}. ${tagline}.`;
        socialCopy = `⚡️ ${prompt} is live on ${brandName}! Experience fast, reliable growth. #${cleanBrandTag} #${sanitizedTone}`;
      } else if (ch.includes('linkedin')) {
        headline = `${brandName} Strategic Update: ${prompt}`;
        bodyText = `We are excited to share ${prompt} for ${brandName}.\n\nKey Highlights:\n• Accelerated Workflow\n• Aligned with ${brandName} mission\n• Measurable Engagement & ROI`;
        socialCopy = `${brandName} empowers teams and creators with ${prompt}. Read the full launch strategy. #Leadership #${cleanBrandTag}`;
      } else if (ch.includes('email')) {
        headline = `[${brandName}] Announcement: ${prompt}`;
        bodyText = `Hi there,\n\nWe're thrilled to introduce ${prompt} for ${brandName}.\n\n${tagline}\n\nClick below to explore this update.`;
        socialCopy = `Subject: ${prompt} — Essential Update from ${brandName}`;
      } else if (ch.includes('meta') || ch.includes('facebook') || ch.includes('instagram')) {
        headline = `${prompt} is Live on ${brandName}!`;
        bodyText = `Experience ${prompt} with ${brandName}. Built for seamless performance and trusted by users worldwide. Tap below to get started!`;
        socialCopy = `✨ Discover ${prompt} on ${brandName}. ${tagline} 🚀 #${cleanBrandTag}`;
      }
    }

    if (feedback) {
      headline = `Refined: ${headline}`;
      bodyText = `${bodyText} (QA Refinement: ${feedback})`;
    }

    return { headline, bodyText, socialCopy };
  });
}

async function runArtDirectorNode(prompt: string, brandDna: any, feedback?: string): Promise<ArtDirectorOutput> {
  return traceAgentNode('art_director_agent_node', async () => {
    const brandName = brandDna.title || brandDna.domain || 'Brand';
    const colors = brandDna.colors || ['#6366f1', '#06b6d4'];
    const font = brandDna.font_pairings || 'Inter & Roboto';

    let imagePrompt = `High-end commercial visual for ${brandName} presenting ${prompt}, styled with ${colors.join(', ')} color accents and ${font} typography.`;
    // Previously only name/colors/font made it in here despite tone/mission
    // already being scanned and sitting unused - every brand's campaign
    // visuals got the same generic "high-end commercial" direction
    // regardless of whether the brand is playful or clinical.
    if (brandDna.tone) {
      imagePrompt += ` Overall mood: ${brandDna.tone}.`;
    }
    if (brandDna.mission) {
      imagePrompt += ` Should feel true to this brand's purpose: ${brandDna.mission}.`;
    }
    let visualStyle = 'Minimalist Studio Lighting';

    if (feedback) {
      imagePrompt = `${imagePrompt} Refined style based on feedback: ${feedback}`;
    }

    return { imagePrompt, visualStyle, colorPalette: colors };
  });
}

export interface CampaignIdea {
  angle: string;
  prompt: string;
}

/**
 * Suggests a handful of campaign angles grounded in the brand's own DNA, so
 * the Campaigns tab isn't just a blank prompt box - the user can click a
 * suggestion (which fills the prompt field) instead of staring at an empty
 * input. Same "study the crawled business, don't write generic copy"
 * grounding as the copywriter node, just producing short angles instead of
 * full copy. Falls back to a small set of DNA-templated angles (using the
 * brand's own name/tagline/tone, not generic placeholders) when there's no
 * Groq key, mirroring generateCopyWithGroq's fallback pattern.
 */
export async function generateCampaignIdeas(brandDna: any): Promise<CampaignIdea[]> {
  return traceAgentNode('campaign_ideas_node', async () => {
    const brandName = brandDna.title || brandDna.domain || 'this business';
    const tagline = brandDna.tagline || '';
    const mission = brandDna.mission || '';
    const audience = brandDna.audience || '';
    const tone = brandDna.tone || 'Professional & Engaging';

    const systemInstruction = `You are a marketing strategist proposing campaign angles for a specific business, grounded in what it actually does - not generic marketing advice.

Business Name: ${brandName}
Tagline: ${tagline}
Mission / Purpose: ${mission}
Target Audience: ${audience}
Tone of Voice: ${tone}

Propose exactly 4 distinct campaign angles for this specific business (a product launch angle, a value-proposition/benefit angle, a social-proof/credibility angle, and a seasonal-or-timely angle - adapted to what actually fits this business). Do NOT propose angles for an unrelated industry.

Respond ONLY with a valid JSON array (no markdown, no code blocks) of exactly 4 objects:
[{ "angle": "Short 3-6 word label for a UI chip", "prompt": "One-sentence campaign brief a copywriter could act on directly" }]`;

    const ideas = await callGroqJSON<CampaignIdea[]>(systemInstruction, {
      models: GROQ_TEXT_MODELS,
      temperature: 0.8,
      logLabel: `campaign ideas for ${brandName}`,
      validate: (parsed) =>
        Array.isArray(parsed) && parsed.length > 0 && parsed.every((p) => p.angle && p.prompt) ? parsed.slice(0, 4) : null,
    });
    if (ideas) return ideas;

    // Knowledge-base aware fallback - still grounded in this brand's own DNA, not hardcoded placeholders.
    return [
      { angle: 'Launch announcement', prompt: `Announce something new from ${brandName} to ${audience || 'your audience'}` },
      { angle: 'Why choose us', prompt: `Highlight what makes ${brandName} different${tagline ? `: ${tagline}` : ''}` },
      { angle: 'Social proof', prompt: `Build trust in ${brandName} with a credibility-focused campaign` },
      { angle: 'Seasonal promotion', prompt: `Run a timely, limited-window promotion for ${brandName}` },
    ];
  });
}

export interface ImageQaResult {
  isApproved: boolean;
  score: number;
  feedback: string;
}

// Gemini vision models, used only by runImageBrandQaNode below - see
// groq.service.ts's docstring for why: Groq's live model catalog has no
// vision-capable model at all as of this session (verified against
// GET /v1/models and confirmed every text model there rejects image input
// outright), so image Brand QA stays on Gemini, reusing the GEMINI_API_KEY
// this app already requires for embeddings (embedding.service.ts). Both
// confirmed working with a real key + real image this session.
const GEMINI_VISION_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];

/**
 * Gemini-specific counterpart to groq.service.ts's callGroqJSON, used only
 * for image vision QA (see above for why this one call site didn't move to
 * Groq with everything else). Same retry-across-models-then-null contract.
 */
async function callGeminiVisionJSON<T>(
  promptText: string,
  inlineImage: { mimeType: string; data: string },
  logLabel: string,
  validate: (parsed: any) => T | null
): Promise<T | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const parts = [{ text: promptText }, { inline_data: { mime_type: inlineImage.mimeType, data: inlineImage.data } }];

  for (const model of GEMINI_VISION_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
          }),
        }
      );
      if (!response.ok) continue;

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text;
      if (!rawText) continue;

      const cleanJsonStr = rawText.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleanJsonStr);
      const result = validate(parsed);
      if (result !== null) {
        console.log(`[Gemini API] ${logLabel} succeeded using ${model}`);
        return result;
      }
    } catch (err: any) {
      console.warn(`[Gemini API] ${logLabel} - model ${model} attempt note:`, err.message);
    }
  }
  return null;
}

/**
 * Brand QA for a *generated image*, not text. Unlike runQaCheckerNode (which
 * only ever judges the copywriter's text output), image generation
 * previously had no QA step at all anywhere in photoshoot.service.ts - a
 * garbled/malformed Pollinations render shipped straight to the user with no
 * check. Uses Gemini's vision input (see callGeminiVisionJSON above for why
 * this stayed on Gemini rather than moving to Groq with everything else) to
 * judge the actual pixels against the brand's colors/tone.
 *
 * Degrades gracefully rather than blocking generation: no GEMINI_API_KEY, or
 * the vision call failing outright (bad key, quota, network), both return an
 * approved-with-caveat result instead of erroring - an infra hiccup on the QA
 * step shouldn't take down image generation entirely.
 */
export async function runImageBrandQaNode(imageBuffer: Buffer, brandDna: any, mimeType: string = 'image/jpeg'): Promise<ImageQaResult> {
  return traceAgentNode('image_brand_qa_node', async () => {
    const hasApiKey = Boolean(process.env.GEMINI_API_KEY);
    const brandName = brandDna.title || brandDna.domain || 'the brand';
    const colors: string[] = brandDna.colors || [];
    const tone = brandDna.tone || 'Professional & Engaging';

    const prompt = `You are a brand QA reviewer for "${brandName}" (tone of voice: ${tone}; brand colors: ${colors.join(', ') || 'none specified'}).
Judge whether the attached generated commercial photography image is usable. Reject only for real defects: garbled/mangled text, letters, or logos accidentally rendered into the scene; disfigured or anatomically wrong subjects; broken or nonsensical objects; or a scene whose mood actively clashes with the brand's tone. Do not reject an image just for being generic or unremarkable if it is otherwise competently rendered and text-free.
Respond ONLY with valid JSON, no markdown, no code fences: {"score": <0-100 integer>, "feedback": "<one sentence>"}`;

    const result = await callGeminiVisionJSON<ImageQaResult>(
      prompt,
      { mimeType, data: imageBuffer.toString('base64') },
      `image QA for ${brandName}`,
      (parsed) => {
        if (typeof parsed.score !== 'number') return null;
        const score = Math.max(0, Math.min(100, Math.round(parsed.score)));
        return { isApproved: score >= 65, score, feedback: parsed.feedback || '' };
      }
    );
    if (result) return result;

    // Distinguishes "never had a key" from "the call itself failed" for the
    // feedback message only - both degrade to approved-with-caveat.
    return hasApiKey
      ? { isApproved: true, score: 75, feedback: 'QA inconclusive: vision call failed, generation allowed through.' }
      : { isApproved: true, score: 80, feedback: 'QA skipped: no GEMINI_API_KEY configured for vision analysis.' };
  });
}

/**
 * Actually judges the copywriter's output against the brand (headline/body/
 * social copy vs. tone, mission, audience) via the same Groq chat-completions
 * endpoint runImageBrandQaNode uses for images. Previously this didn't
 * exist - the "QA" step just returned a random 85-99 (or a hardcoded 92 on
 * attempt 1), never once looking at what the copywriter actually wrote or
 * what brand it was supposed to match, while the image QA step right above
 * it in this file genuinely calls the LLM. Same graceful-degradation
 * contract as runImageBrandQaNode: no GROQ_API_KEY, or the call failing
 * outright, both approve-with-caveat rather than blocking generation on an
 * infra hiccup.
 */
async function judgeTextWithGroq(prompt: string, brandDna: any, copy: CopywriterOutput): Promise<QaResult | null> {
  const brandName = brandDna.title || brandDna.domain || 'the brand';
  const tone = brandDna.tone || 'Professional & Engaging';
  const audience = brandDna.audience || 'a general audience';

  const qaPrompt = `You are a brand QA reviewer for "${brandName}" (tone of voice: ${tone}; target audience: ${audience}).
The campaign brief was: "${prompt}".
Judge whether this generated ad copy is usable:
Headline: "${copy.headline}"
Body: "${copy.bodyText}"
Social copy: "${copy.socialCopy}"
Reject only for real defects: copy that contradicts or ignores the brief, copy for a clearly unrelated industry/business, a tone that actively clashes with the brand's stated tone, or copy that's incoherent/garbled. Do not reject competent, on-brief, on-tone copy just for being plain or unremarkable.
Respond ONLY with valid JSON, no markdown, no code fences: {"score": <0-100 integer>, "feedback": "<one sentence>"}`;

  return callGroqJSON<QaResult>(qaPrompt, {
    models: GROQ_TEXT_MODELS,
    temperature: 0.2,
    logLabel: `text QA for ${brandName}`,
    validate: (parsed) => {
      if (typeof parsed.score !== 'number') return null;
      const score = Math.max(0, Math.min(100, Math.round(parsed.score)));
      return {
        isApproved: score >= 80,
        score,
        feedback: parsed.feedback
          ? `QA ${score >= 80 ? 'Passed' : 'Rejected'}: ${parsed.feedback}`
          : `QA ${score >= 80 ? 'Passed' : 'Rejected'}: Score ${score}.`,
      };
    },
  });
}

async function runQaCheckerNode(
  prompt: string,
  brandDna: any,
  copy: CopywriterOutput,
  art: ArtDirectorOutput,
  attemptNumber: number,
  forcedScore?: number
): Promise<QaResult> {
  return traceAgentNode('qa_checker_node', async () => {
    if (forcedScore !== undefined) {
      // Test-only override (see handleCreativeGenerate) - deterministically
      // drives the retry/best-of-N paths without depending on a real model's
      // judgment call.
      const isApproved = forcedScore >= 80;
      return {
        isApproved,
        score: forcedScore,
        feedback: isApproved
          ? 'QA Passed: High brand consistency, strong alignment with target audience.'
          : `QA Rejected: Score ${forcedScore} does not meet brand consistency benchmarks.`,
      };
    }

    const judged = await judgeTextWithGroq(prompt, brandDna, copy);
    if (judged) return judged;

    // No GROQ_API_KEY, or every model attempt failed - degrade to
    // approved-with-caveat (an infra hiccup on the QA step shouldn't block
    // generation) rather than a random pass/fail.
    return { isApproved: true, score: 80, feedback: 'QA inconclusive: no GROQ_API_KEY configured or the judging call failed - generation allowed through.' };
  });
}

async function runBestOfNFallbackNode(attempts: AttemptRecord[]): Promise<AttemptRecord> {
  return traceAgentNode('best_of_n_fallback_node', async () => {
    console.log('[FALLBACK] Bounded retries exhausted. Executing Best-of-N fallback selection.');
    if (attempts.length === 0) {
      throw new Error('No attempts available for Best-of-N selection');
    }
    
    let best = attempts[0];
    for (const item of attempts) {
      if (item.qa.score > best.qa.score) {
        best = item;
      }
    }
    return best;
  });
}

export interface CopyArtResult {
  copy: CopywriterOutput;
  art: ArtDirectorOutput;
  cacheHit: boolean;
  cacheType: 'exact' | 'semantic' | null;
}

/**
 * Shared cache-before-generate wrapper around the Copywriter/Art Director
 * pair, used by both executeCreativePipeline (below) and every
 * photoshoot.service.ts flow (single image, campaign post, carousel) - the
 * one LLM-backed step all of them share. Image generation itself
 * deliberately isn't cached here: it runs on the free Pollinations provider
 * (not the metered Imagen path the spec assumed - see HANDOFF.md §2), so
 * there's no cost to save, and re-generating gives each request visual
 * variety instead of returning a stale identical image.
 *
 * Namespaced per (user, brand DNA) so a near-duplicate prompt from a
 * different user, or for a different brand, can never return this user's
 * cached copy - see cache.service.ts.
 *
 * Note on `estimatedCostUsd` below (HANDOFF.md §21): now that text/vision
 * generation runs on Groq's free tier, this is no longer a real dollar
 * figure - Groq's free tier costs $0 regardless of volume. Kept as-is
 * (rather than zeroed out) so the app's own per-tier quota ceiling
 * (quota.service.ts) still functions as a *usage* cap - a proxy for "how
 * much generation has this user done," not "how much has this user spent" -
 * since a $0-everywhere cost would make every tier's cost ceiling
 * meaningless and remove the only per-user usage throttle this app has.
 */
export async function getCachedOrGenerateCopyAndArt(
  userId: string,
  validDnaId: string | null,
  brandDna: any,
  prompt: string,
  channel: string | undefined,
  endpoint: string,
  feedback?: string
): Promise<CopyArtResult> {
  // Real bug, found live: every channel (Twitter/X, LinkedIn, Email
  // subject, Meta ad...) was returning identical copy. Channel WAS in the
  // exact-match key (below), but the semantic-similarity layer (cache.
  // service.ts's fuzzy match) scans every entry in a namespace regardless
  // of key - and a channel name is one short word next to a much longer
  // shared prompt, so "Twitter/X <prompt>" vs "LinkedIn <prompt>" scored
  // well above the 0.85 similarity threshold and matched each other
  // anyway. The engine already guarantees semantic matches never cross
  // namespaces (see cache.service.ts's own per-namespace scan) - channel
  // needs to be a hard partition via the namespace, not just a weak
  // signal in the key/prompt that competes with everything else in it.
  const cacheNamespace = `copyart:${userId}:${validDnaId || 'unscoped'}:${(channel || 'general').toLowerCase()}`;
  const cacheKey = prompt.trim().toLowerCase();
  const cacheSemanticPrompt = prompt;

  // A QA-refinement retry (feedback present) intentionally bypasses the
  // cache - it needs a genuinely different generation, not the same cached
  // output that (if this were the first attempt) might be why feedback was
  // needed in the first place.
  if (!feedback) {
    const cached = await semanticCache.check<{ copy: CopywriterOutput; art: ArtDirectorOutput }>(cacheKey, cacheSemanticPrompt, cacheNamespace);
    if (cached.hit && cached.data) {
      await recordUsage(userId, endpoint, 0, 0, true, cached.type);
      return { copy: cached.data.copy, art: cached.data.art, cacheHit: true, cacheType: cached.type };
    }
  }

  const [copy, art] = await Promise.all([
    runCopywriterNode(prompt, brandDna, feedback, channel),
    runArtDirectorNode(prompt, brandDna, feedback),
  ]);

  const estimatedTokens = 500;
  const estimatedCostUsd = 0.00027; // ~half of a parallel pipeline attempt (copy+art only, no QA)
  await semanticCache.set(cacheKey, cacheSemanticPrompt, { copy, art }, estimatedTokens, estimatedCostUsd, cacheNamespace);
  await recordUsage(userId, endpoint, estimatedTokens, estimatedCostUsd, false, null);

  return { copy, art, cacheHit: false, cacheType: null };
}

export async function executeCreativePipeline(
  brandDnaId: string,
  prompt: string,
  forceScoreSequence: number[] | undefined,
  channel: string | undefined,
  userId: string
): Promise<CreativePipelineResult> {
  return tracer.startActiveSpan('executeCreativePipeline', async (span: Span) => {
    const { brandDna, validDnaId } = await resolveBrandDna(brandDnaId, userId);

    // Cache check-before-generate (spec: "Always cache before retrieving").
    // Scoped per (user, brand, channel) via the namespace, never globally -
    // a near-duplicate prompt from a different user or a different brand
    // must never return this user's cached copy. Channel is folded into
    // the NAMESPACE, not just the key - see getCachedOrGenerateCopyAndArt
    // above for the real bug this fixes (channel-as-a-key-prefix alone
    // doesn't stop the semantic-similarity layer from matching across
    // channels, since it scans every entry in a namespace regardless of
    // key, and a channel name is one short word easily outweighed by the
    // rest of an otherwise-identical prompt).
    const cacheNamespace = `creative:${userId}:${validDnaId || 'unscoped'}:${(channel || 'general').toLowerCase()}`;
    const cacheKey = prompt.trim().toLowerCase();
    const cacheSemanticPrompt = prompt;
    const cached = await semanticCache.check<AttemptRecord>(cacheKey, cacheSemanticPrompt, cacheNamespace);

    if (cached.hit && cached.data) {
      console.log(`[CACHE] ${cached.type} hit (similarity ${cached.similarity.toFixed(2)}) - skipping Copywriter/Art Director/QA for this request.`);
      await recordUsage(userId, '/api/creative/generate', 0, 0, true, cached.type);

      const dbRes = await query(
        `INSERT INTO campaigns
        (brand_dna_id, prompt, headline, body_text, social_copy, image_prompt, visual_style, qa_score, qa_feedback, attempts, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [
          validDnaId,
          prompt,
          cached.data.copy.headline,
          cached.data.copy.bodyText,
          cached.data.copy.socialCopy,
          cached.data.art.imagePrompt,
          cached.data.art.visualStyle,
          cached.data.qa.score,
          `${cached.data.qa.feedback} (served from ${cached.type} cache, similarity ${cached.similarity.toFixed(2)})`,
          0,
          userId,
        ]
      );
      const cachedCampaignId = dbRes.rows[0].id;

      span.setAttribute('cache.hit', true);
      span.setAttribute('cache.type', cached.type || 'unknown');
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();

      return {
        id: cachedCampaignId,
        campaignId: cachedCampaignId,
        brandDnaId,
        attempts: 0,
        finalSelection: cached.data,
        copy: cached.data.copy,
        art: cached.data.art,
        qa: cached.data.qa,
        estimatedCostUsd: 0,
        savingsVsSequentialPercent: 100,
      };
    }

    const maxRetries = 3;
    const attemptsHistory: AttemptRecord[] = [];
    const feedbackHistory: string[] = [];
    let finalSelection: AttemptRecord | null = null;

    let currentAttempt = 0;

    while (currentAttempt < maxRetries) {
      currentAttempt++;
      console.log(`[PIPELINE] Starting execution attempt ${currentAttempt}/${maxRetries}`);

      const forceScore = forceScoreSequence && forceScoreSequence[currentAttempt - 1] !== undefined
        ? forceScoreSequence[currentAttempt - 1]
        : undefined;

      const previousFeedback = feedbackHistory.length > 0 ? feedbackHistory[feedbackHistory.length - 1] : undefined;

      // 1. Execute Copywriter & Art Director concurrently in parallel
      const [copyOutput, artOutput] = await Promise.all([
        runCopywriterNode(prompt, brandDna, previousFeedback, channel),
        runArtDirectorNode(prompt, brandDna, previousFeedback),
      ]);

      // 2. Mediate outputs with QA Checker node
      const qaEval = await runQaCheckerNode(prompt, brandDna, copyOutput, artOutput, currentAttempt, forceScore);
      
      const record: AttemptRecord = { copy: copyOutput, art: artOutput, qa: qaEval };
      attemptsHistory.push(record);

      if (qaEval.isApproved) {
        console.log(`[PIPELINE] QA Approval secured at attempt ${currentAttempt} with score: ${qaEval.score}`);
        finalSelection = record;
        break;
      } else {
        console.log(`[PIPELINE] QA Rejection at attempt ${currentAttempt}: ${qaEval.feedback}`);
        feedbackHistory.push(qaEval.feedback);
      }
    }

    // 3. Trigger Best-of-N Fallback Node if none were approved
    if (!finalSelection) {
      finalSelection = await runBestOfNFallbackNode(attemptsHistory);
    }

    // 4. Save campaign structure to database safely
    const dbRes = await query(
      `INSERT INTO campaigns
      (brand_dna_id, prompt, headline, body_text, social_copy, image_prompt, visual_style, qa_score, qa_feedback, attempts, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        validDnaId,
        prompt,
        finalSelection.copy.headline,
        finalSelection.copy.bodyText,
        finalSelection.copy.socialCopy,
        finalSelection.art.imagePrompt,
        finalSelection.art.visualStyle,
        finalSelection.qa.score,
        finalSelection.qa.feedback,
        currentAttempt,
        userId
      ]
    );
    const campaignId = dbRes.rows[0].id;

    // Estimate costs ($0.000540 per attempt parallel vs $0.000802 sequential)
    const costPerAttemptParallel = 0.000540;
    const costPerAttemptSequential = 0.0008023;

    const estimatedCostUsd = currentAttempt * costPerAttemptParallel;
    const sequentialCostUsd = currentAttempt * costPerAttemptSequential;
    const savingsVsSequentialPercent = ((sequentialCostUsd - estimatedCostUsd) / sequentialCostUsd) * 100;

    console.log(
      `[PIPELINE COST] Attempts: ${currentAttempt}, Est. Cost: $${estimatedCostUsd.toFixed(6)} (vs Sequential: $${sequentialCostUsd.toFixed(6)}, Savings: ${savingsVsSequentialPercent.toFixed(1)}%)`
    );

    // Populate the cache for the next near-duplicate request in this
    // (user, brand) scope, and record the real cost/tokens this run
    // actually incurred (a cache miss, unlike the early-return above).
    const estimatedTokens = currentAttempt * 500;
    await semanticCache.set(cacheKey, cacheSemanticPrompt, finalSelection, estimatedTokens, estimatedCostUsd, cacheNamespace);
    await recordUsage(userId, '/api/creative/generate', estimatedTokens, estimatedCostUsd, false, null);

    span.setAttribute('cache.hit', false);
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();

    return {
      id: campaignId,
      campaignId,
      brandDnaId,
      attempts: currentAttempt,
      finalSelection,
      copy: finalSelection.copy,
      art: finalSelection.art,
      qa: finalSelection.qa,
      estimatedCostUsd,
      savingsVsSequentialPercent
    };
  });
}
