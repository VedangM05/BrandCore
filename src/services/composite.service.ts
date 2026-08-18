import sharp from 'sharp';
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('brandcore-composite-service');

export interface CompositeTextOptions {
  headline: string;
  eyebrow?: string;
  accentColor?: string;
  width: number;
  height: number;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Naive but predictable word-wrap by character count. Good enough for a
 * bold display headline where perfect kerning-aware wrapping isn't worth
 * the complexity - this is what keeps text legible without ever truncating
 * mid-word.
 */
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function isValidHexColor(color: string | undefined): color is string {
  return !!color && /^#[0-9a-fA-F]{6}$/.test(color);
}

/**
 * Composites a headline (and optional eyebrow label) onto a background image
 * as a bottom scrim + text overlay, rendered server-side via sharp/SVG.
 *
 * Deliberately does NOT ask the image-generation model to render the text
 * itself - AI image models are unreliable at legible text rendering, so the
 * background is generated text-free and the actual copy is composited here
 * with full control over legibility, wrapping, and brand color.
 */
export async function compositeHeadlineOnImage(
  imageBuffer: Buffer,
  options: CompositeTextOptions
): Promise<Buffer> {
  return tracer.startActiveSpan('composite_headline_on_image', async (span) => {
    try {
      const { width, height } = options;
      span.setAttribute('composite.width', width);
      span.setAttribute('composite.height', height);

      const accent = isValidHexColor(options.accentColor) ? options.accentColor : '#17160F';

      const fontSize = Math.max(28, Math.round(width * 0.052));
      const maxCharsPerLine = Math.max(10, Math.round(width / (fontSize * 0.56)));
      const lines = wrapText(options.headline, maxCharsPerLine).slice(0, 4);
      const lineHeight = fontSize * 1.18;

      const scrimHeight = Math.round(height * 0.4) + lines.length * lineHeight;
      const textBlockHeight = lines.length * lineHeight + (options.eyebrow ? fontSize * 0.9 : 0);
      const textStartY = height - 48 - textBlockHeight;

      // The eyebrow renders in the brand's accent color (computed above but
      // previously never actually applied anywhere - it was validated and
      // then silently dropped, leaving every eyebrow plain white regardless
      // of the brand's colors). The headline stays white for contrast
      // against the dark scrim; the eyebrow is the one line meant to carry
      // brand color, matching how callers already pair eyebrow+accentColor
      // together (see photoshoot.service.ts, AssetEditor.tsx's
      // buildDefaultTextLayers).
      const eyebrowSvg = options.eyebrow
        ? `<text x="48" y="${textStartY}" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize * 0.42}" font-weight="700" letter-spacing="1.5" fill="${accent}">${escapeXml(options.eyebrow.toUpperCase())}</text>`
        : '';

      const headlineStartY = textStartY + (options.eyebrow ? fontSize * 0.9 : 0) + fontSize;
      const headlineTspans = lines
        .map((line, idx) => `<tspan x="48" y="${headlineStartY + idx * lineHeight}">${escapeXml(line)}</tspan>`)
        .join('');

      const svg = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#000000" stop-opacity="0" />
              <stop offset="100%" stop-color="#000000" stop-opacity="0.72" />
            </linearGradient>
          </defs>
          <rect x="0" y="${height - scrimHeight}" width="${width}" height="${scrimHeight}" fill="url(#scrim)" />
          ${eyebrowSvg}
          <text font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#FFFFFF" letter-spacing="-0.5">
            ${headlineTspans}
          </text>
        </svg>
      `;

      const output = await sharp(imageBuffer)
        .resize(width, height, { fit: 'cover', position: 'attention' })
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .jpeg({ quality: 92 })
        .toBuffer();

      span.setAttribute('composite.output_bytes', output.length);
      span.setStatus({ code: SpanStatusCode.OK });
      return output;
    } catch (error: any) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Resizes/normalizes a background image with no text overlay - used for the
 * plain single-scene "photoshoot" output where no headline is composited.
 */
export async function normalizeImage(imageBuffer: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(imageBuffer)
    .resize(width, height, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 92 })
    .toBuffer();
}
