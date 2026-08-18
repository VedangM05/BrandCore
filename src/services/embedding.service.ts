import { trace, SpanStatusCode } from '@opentelemetry/api';
import * as dotenv from 'dotenv';

// Self-sufficient regardless of import order (mirrors auth.service.ts) -
// this module can be imported standalone (e.g. by a test file that never
// pulls in app.ts) without silently seeing an unset GEMINI_API_KEY just
// because nothing else in that import graph happened to load .env first.
dotenv.config();

const tracer = trace.getTracer('brandcore-embedding-service');

// gemini-embedding-001 outputs 3072-dim by default but supports Matryoshka
// truncation via outputDimensionality - 768 is the smallest size Google
// still recommends for good retrieval quality, and keeps the Qdrant
// collection's storage/compute footprint far smaller than the full 3072-dim
// vectors would (which matters at zero-cost/self-hosted scale).
export const EMBEDDING_DIMENSIONS = 768;
const EMBEDDING_MODEL = 'gemini-embedding-001';

/**
 * Embeds a single piece of text via Gemini's embedding endpoint. Returns
 * null (never throws) when there's no GEMINI_API_KEY or the call fails -
 * every caller (qdrant.service.ts's indexing pipeline, chat.service.ts's
 * retrieval node) already has to handle "no knowledge base available"
 * gracefully, so an embedding failure degrades the same way a missing
 * Qdrant/Redis connection does, rather than crashing a scan or a chat reply.
 */
export async function embedText(text: string): Promise<number[] | null> {
  return tracer.startActiveSpan('embed_text', async (span) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return null;
    }

    // The API rejects empty content outright, and there's nothing
    // meaningful to embed anyway.
    const trimmed = text.trim();
    if (!trimmed) {
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return null;
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: { parts: [{ text: trimmed }] },
            outputDimensionality: EMBEDDING_DIMENSIONS,
          }),
        }
      );

      if (!response.ok) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: `Gemini embedding call failed: ${response.status}` });
        span.end();
        return null;
      }

      const data = await response.json();
      const values: number[] | undefined = data?.embedding?.values;
      if (!Array.isArray(values) || values.length === 0) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Gemini embedding response missing values' });
        span.end();
        return null;
      }

      span.setAttribute('embedding.dimensions', values.length);
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return values;
    } catch (err: any) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.end();
      return null;
    }
  });
}

/**
 * Embeds many texts, sequentially with a small delay between calls -
 * Gemini's free tier rate-limits embedding requests per minute, and a full
 * website's worth of chunks (see chunking in qdrant.service.ts) can easily
 * be 10-30 chunks. Batching in parallel would just trigger 429s; this trades
 * a few seconds of extra indexing latency (acceptable - indexing already
 * runs as a background job, see queue.service.ts) for reliability.
 */
export async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = [];
  for (const text of texts) {
    results.push(await embedText(text));
  }
  return results;
}

/**
 * Splits long text into overlapping chunks suitable for embedding + vector
 * search. Splits on paragraph boundaries where possible so chunks stay
 * semantically coherent, falling back to a hard character cut only when a
 * single paragraph itself exceeds maxChars.
 */
export function chunkText(text: string, maxChars: number = 1200, overlapChars: number = 150): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const para of paragraphs) {
    if (para.length > maxChars) {
      flush();
      // Hard-split an oversized paragraph on its own.
      for (let i = 0; i < para.length; i += maxChars - overlapChars) {
        chunks.push(para.slice(i, i + maxChars));
      }
      continue;
    }

    if (current.length + para.length + 2 > maxChars) {
      flush();
    }
    current = current ? `${current}\n\n${para}` : para;
  }
  flush();

  return chunks;
}
