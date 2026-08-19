import * as crypto from 'crypto';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { query } from '../db';
import { qdrantService } from './qdrant.service';
import { chunkText } from './embedding.service';
import { defaultQueueManager } from './queue.service';

const tracer = trace.getTracer('brandcore-knowledge-base-service');

const INDEX_KNOWLEDGE_JOB = 'index_brand_knowledge';

export interface IndexKnowledgeJobPayload {
  brandDnaId: string;
}

/**
 * Chunks a scanned brand's crawled content and indexes it into the shared
 * Qdrant collection (spec Phase B: "Knowledge Base Creation" - chunk
 * content, generate embeddings, store in Qdrant). Re-indexing (a rescan of
 * the same URL) first deletes the brand's prior points so stale chunks from
 * an old version of the site don't linger in search results forever.
 *
 * Runs as a background BullMQ job (see registerHandler below), not inline
 * during the scan request - embedding a whole site's worth of chunks is
 * several sequential Gemini calls (see embedTexts' rate-limit-friendly
 * sequencing) and shouldn't make the user wait for it before seeing their
 * Brand DNA results.
 */
export async function indexBrandKnowledge(brandDnaId: string): Promise<{ chunksIndexed: number }> {
  return tracer.startActiveSpan('index_brand_knowledge', async (span) => {
    span.setAttribute('knowledge.brand_dna_id', brandDnaId);

    const res = await query('SELECT markdown_content, title, tagline, mission, audience, value_proposition FROM crawl_results WHERE id = $1', [
      brandDnaId,
    ]);
    if (res.rows.length === 0) {
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return { chunksIndexed: 0 };
    }

    const row = res.rows[0];
    await qdrantService.deleteProjectDocuments(brandDnaId);

    // The synthesized brand summary fields are indexed as their own
    // high-signal chunk (type 'brand_memory') alongside the raw crawled
    // page content (type 'website_page') - a question like "what's your
    // mission?" should retrieve the synthesized answer directly rather
    // than relying on it being findable somewhere in raw markdown.
    const summaryParts = [row.title, row.tagline, row.mission, row.audience, row.value_proposition].filter(Boolean);
    const chunks: Array<{ text: string; type: 'website_page' | 'brand_memory' }> = [];
    if (summaryParts.length > 0) {
      chunks.push({ text: summaryParts.join('\n'), type: 'brand_memory' });
    }
    for (const c of chunkText(row.markdown_content || '')) {
      chunks.push({ text: c, type: 'website_page' });
    }

    let indexed = 0;
    for (const chunk of chunks) {
      const ok = await qdrantService.upsertDocument({
        id: crypto.randomUUID(),
        projectId: brandDnaId,
        type: chunk.type,
        text: chunk.text,
      });
      if (ok) indexed++;
    }

    span.setAttribute('knowledge.chunks_indexed', indexed);
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    return { chunksIndexed: indexed };
  });
}

// Registered once at module load - see queue.service.ts's registerHandler
// docstring for why real BullMQ needs this registered upfront rather than
// passed in per-call.
defaultQueueManager.registerHandler(INDEX_KNOWLEDGE_JOB, async (payload: IndexKnowledgeJobPayload) => {
  return indexBrandKnowledge(payload.brandDnaId);
});

/**
 * Enqueues the background indexing job - called from dna.service.ts after
 * a successful scan. Returns the BullMQ job id so tests (and any future
 * "indexing status" UI) can wait for/check on it via
 * `defaultQueueManager.waitForCompletion(jobId)`.
 */
export async function enqueueKnowledgeIndexing(brandDnaId: string): Promise<string> {
  const job = await defaultQueueManager.add(INDEX_KNOWLEDGE_JOB, { brandDnaId } as IndexKnowledgeJobPayload);
  return job.id;
}
