import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('brandcore-image-service');

const POLLINATIONS_BASE_URL = process.env.POLLINATIONS_BASE_URL || 'https://image.pollinations.ai';
// Optional: a free Pollinations account token raises the anonymous rate limit
// (~1 req/15s) and removes the watermark. Entirely optional - unset works fine.
const POLLINATIONS_TOKEN = process.env.POLLINATIONS_TOKEN;

export interface GenerateImageOptions {
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
  negativePrompt?: string;
}

export interface GeneratedImage {
  buffer: Buffer;
  mimeType: string;
  provider: string;
  model: string;
  prompt: string;
  width: number;
  height: number;
}

const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 1024;
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 60000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generates an image via Pollinations.ai (FLUX-backed, no API key required).
 * This is a free, open-model image generation backend chosen specifically
 * because it has no billing/quota wall - see src/services/image.service.ts
 * usage sites for context. Retries on rate-limit/5xx with backoff, since the
 * anonymous tier throttles to roughly one request per ~15s.
 */
export async function generateImage(options: GenerateImageOptions): Promise<GeneratedImage> {
  return tracer.startActiveSpan('generate_image', async (span) => {
    const width = options.width || DEFAULT_WIDTH;
    const height = options.height || DEFAULT_HEIGHT;
    const seed = options.seed ?? Math.floor(Math.random() * 1_000_000);

    span.setAttribute('image.provider', 'pollinations');
    span.setAttribute('image.model', 'flux');
    span.setAttribute('image.width', width);
    span.setAttribute('image.height', height);

    const promptText = options.negativePrompt
      ? `${options.prompt}. Avoid: ${options.negativePrompt}`
      : options.prompt;

    const params = new URLSearchParams({
      width: String(width),
      height: String(height),
      model: 'flux',
      nologo: 'true',
      safe: 'true',
      seed: String(seed),
    });
    if (POLLINATIONS_TOKEN) params.set('token', POLLINATIONS_TOKEN);

    const url = `${POLLINATIONS_BASE_URL}/prompt/${encodeURIComponent(promptText)}?${params.toString()}`;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (response.status === 429 || response.status >= 500) {
          const backoffMs = Math.min(16000, 2000 * 2 ** (attempt - 1));
          span.addEvent('image_generation_retry', { attempt, status: response.status, backoffMs });
          lastError = new Error(`Image provider returned ${response.status}`);
          if (attempt < MAX_ATTEMPTS) {
            await sleep(backoffMs);
            continue;
          }
          break;
        }

        if (!response.ok) {
          throw new Error(`Image provider returned ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const mimeType = response.headers.get('content-type') || 'image/jpeg';

        if (buffer.length === 0) {
          throw new Error('Image provider returned an empty response body');
        }

        span.setAttribute('image.bytes', buffer.length);
        span.setAttribute('image.attempts', attempt);
        span.setStatus({ code: SpanStatusCode.OK });

        return {
          buffer,
          mimeType,
          provider: 'pollinations',
          model: 'flux',
          prompt: promptText,
          width,
          height,
        };
      } catch (err: any) {
        clearTimeout(timeout);
        lastError = err;
        if (err.name === 'AbortError') {
          lastError = new Error(`Image generation timed out after ${REQUEST_TIMEOUT_MS}ms`);
        }
        if (attempt < MAX_ATTEMPTS) {
          await sleep(Math.min(16000, 2000 * 2 ** (attempt - 1)));
        }
      }
    }

    const error = lastError || new Error('Image generation failed for an unknown reason');
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    throw error;
  });
}

const SITE_IMAGE_TIMEOUT_MS = 15000;

/**
 * Downloads a real image already on the scanned brand's own site (captured
 * by crawl_agent.py's extract_site_images), shaped like a GeneratedImage so
 * photoshoot.service.ts's pipeline (QA, compositing, normalizeImage) can
 * treat it identically to a Pollinations render - see
 * findMatchingSiteImage/generateBrandQaApprovedImage. `provider: 'site-asset'`
 * distinguishes it from a genuinely AI-generated image in asset metadata.
 */
export async function fetchSiteImage(url: string, width: number, height: number): Promise<GeneratedImage> {
  return tracer.startActiveSpan('fetch_site_image', async (span) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SITE_IMAGE_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`Site image fetch failed with status ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.length === 0) {
        throw new Error('Site image fetch returned an empty response body');
      }
      const mimeType = response.headers.get('content-type') || 'image/jpeg';
      span.setAttribute('image.bytes', buffer.length);
      span.setStatus({ code: SpanStatusCode.OK });
      return { buffer, mimeType, provider: 'site-asset', model: 'existing-site-image', prompt: url, width, height };
    } catch (err: any) {
      clearTimeout(timeout);
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      throw err;
    } finally {
      span.end();
    }
  });
}
