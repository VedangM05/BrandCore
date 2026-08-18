import { trace, SpanStatusCode } from '@opentelemetry/api';
import { embedText } from './embedding.service';

const tracer = trace.getTracer('brandcore-qdrant-service');

const EMBEDDING_DIMENSIONS = 768; // must match embedding.service.ts's EMBEDDING_DIMENSIONS

export interface QdrantDocument {
  id: string;
  projectId: string;
  type: 'website_page' | 'product' | 'service' | 'blog' | 'faq' | 'testimonial' | 'creative' | 'brand_memory';
  text: string;
  metadata?: Record<string, any>;
  vector?: number[];
}

export interface QdrantSearchResult {
  id: string;
  projectId: string;
  type: string;
  text: string;
  score: number;
  metadata: Record<string, any>;
}

/**
 * Single shared, multi-tenant Qdrant collection (spec: "brand_knowledge",
 * one collection with a project_id payload filter, not a collection per
 * project - see the "Database Design" section of
 * AI_Brand_Intelligence_Platform.md). `projectId` here is this app's Brand
 * DNA id (crawl_results.id) - the same id `resolveBrandDna` already
 * resolves everything else by, so the Knowledge Base is scoped identically
 * to every other brand-scoped feature with no separate id scheme.
 *
 * Degrades to an in-memory, substring-matched fallback whenever QDRANT_URL
 * isn't reachable (not configured, container not running, network blip) -
 * every caller (the indexing pipeline after a scan, the chat retrieval
 * node) already has to handle "results may be empty/lower quality" for the
 * no-GEMINI_API_KEY case, so this is the same shape of degradation, not a
 * new failure mode callers need to special-case.
 */
class QdrantService {
  private collectionName = 'brand_knowledge';
  private qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
  private inMemoryPoints: Map<string, QdrantDocument> = new Map();
  private collectionReadyPromise: Promise<boolean> | null = null;

  /** Test-only: resets in-memory fallback state between test cases. */
  public resetInMemoryFallback(): void {
    this.inMemoryPoints.clear();
  }

  /**
   * Initializes the single shared multi-tenant collection `brand_knowledge`
   * in Qdrant with a payload index on `project_id` and `type`. Idempotent
   * and memoized (safe to call before every write) - creating an
   * already-existing collection/index is a no-op on Qdrant's side, but
   * memoizing avoids a round-trip on every single upsert.
   */
  public async ensureCollection(): Promise<boolean> {
    if (!this.collectionReadyPromise) {
      this.collectionReadyPromise = this.initializeCollection();
    }
    return this.collectionReadyPromise;
  }

  private async initializeCollection(): Promise<boolean> {
    return tracer.startActiveSpan('qdrant_init_collection', async (span) => {
      try {
        const res = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}`);
        if (res.ok) {
          span.setAttribute('qdrant.collection_exists', true);
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return true;
        }

        const createRes = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vectors: {
              size: EMBEDDING_DIMENSIONS,
              distance: 'Cosine',
            },
          }),
        });

        if (createRes.ok) {
          await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/index`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ field_name: 'project_id', field_schema: 'keyword' }),
          });
          await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/index`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ field_name: 'type', field_schema: 'keyword' }),
          });

          console.log(`[Qdrant] Initialized single multi-tenant collection '${this.collectionName}' with payload indexes on project_id/type`);
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return true;
        }
      } catch (err: any) {
        console.log(`[Qdrant] Note: Qdrant unreachable, operating in in-memory fallback mode. (${err.message})`);
      }
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return false;
    });
  }

  /**
   * Embeds `doc.text` (via Gemini) and upserts the resulting vector into
   * Qdrant. Always also stores in the in-memory fallback map, so a search
   * immediately after a Qdrant-unreachable upsert still finds it.
   */
  public async upsertDocument(doc: QdrantDocument): Promise<boolean> {
    return tracer.startActiveSpan('qdrant_upsert_document', async (span) => {
      span.setAttribute('qdrant.project_id', doc.projectId);
      span.setAttribute('qdrant.type', doc.type);

      this.inMemoryPoints.set(doc.id, doc);

      const vector = doc.vector || (await embedText(doc.text));
      if (!vector) {
        // No GEMINI_API_KEY, or the embedding call failed - the in-memory
        // fallback above still has this document for substring search.
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return true;
      }

      try {
        await this.ensureCollection();
        // wait=true - Qdrant's default upsert is async ("acknowledged" but
        // not necessarily queryable yet); without this, a search
        // immediately after an upsert (e.g. this app's own indexing job
        // followed shortly by a chat question) can miss it entirely.
        const res = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points?wait=true`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: [
              {
                id: doc.id,
                vector,
                payload: {
                  project_id: doc.projectId,
                  type: doc.type,
                  text: doc.text,
                  metadata: doc.metadata || {},
                },
              },
            ],
          }),
        });
        if (!res.ok) {
          // Point IDs must be a UUID or unsigned integer (Qdrant rejects
          // anything else) - surfacing the response body here saves a lot
          // of silent-failure debugging versus just returning false.
          const errBody = await res.text().catch(() => '');
          console.warn(`[Qdrant] Upsert failed for document ${doc.id} (project ${doc.projectId}): ${res.status} ${errBody}`);
        }
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return res.ok;
      } catch (err: any) {
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return true; // in-memory fallback already has it
      }
    });
  }

  /**
   * Semantic search scoped to `projectId` via Qdrant's payload filter
   * (single shared collection, not a collection per tenant - see class
   * docstring). Falls back to a substring-match ranking over the in-memory
   * store when Qdrant is unreachable or there's no embeddable query vector
   * (no GEMINI_API_KEY) - lower quality, but keeps the chatbot answering
   * instead of erroring outright.
   */
  public async searchKnowledge(
    projectId: string,
    queryText: string,
    typeFilter?: string,
    limit: number = 5
  ): Promise<QdrantSearchResult[]> {
    return tracer.startActiveSpan('qdrant_search_knowledge', async (span) => {
      span.setAttribute('qdrant.project_id', projectId);
      span.setAttribute('qdrant.query', queryText);

      const filterConditions: any[] = [{ key: 'project_id', match: { value: projectId } }];
      if (typeFilter) {
        filterConditions.push({ key: 'type', match: { value: typeFilter } });
      }

      const queryVector = await embedText(queryText);
      if (queryVector) {
        try {
          const res = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vector: queryVector,
              filter: { must: filterConditions },
              limit,
              with_payload: true,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            const results: QdrantSearchResult[] = (data.result || []).map((p: any) => ({
              id: String(p.id),
              projectId: p.payload.project_id,
              type: p.payload.type,
              text: p.payload.text,
              score: p.score,
              metadata: p.payload.metadata || {},
            }));
            span.setStatus({ code: SpanStatusCode.OK });
            span.end();
            return results;
          }
        } catch {
          // Fall through to in-memory search below.
        }
      }

      const results: QdrantSearchResult[] = [];
      const queryWords = queryText.toLowerCase().split(/\s+/).filter(Boolean);

      for (const doc of this.inMemoryPoints.values()) {
        if (doc.projectId !== projectId) continue;
        if (typeFilter && doc.type !== typeFilter) continue;

        let matches = 0;
        const textLower = doc.text.toLowerCase();
        for (const w of queryWords) {
          if (textLower.includes(w)) matches++;
        }
        if (matches === 0 && queryWords.length > 0) continue; // no fabricated relevance
        const score = queryWords.length > 0 ? matches / queryWords.length : 0.5;

        results.push({
          id: doc.id,
          projectId: doc.projectId,
          type: doc.type,
          text: doc.text,
          score,
          metadata: doc.metadata || {},
        });
      }

      results.sort((a, b) => b.score - a.score);
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return results.slice(0, limit);
    });
  }

  /**
   * Cheap existence check - does this project have any indexed content at
   * all? Used by the "is the Knowledge Base ready yet" status endpoint
   * (chat.controller.ts) so the chat UI can distinguish "still indexing in
   * the background" from "nothing was ever indexed" instead of only
   * finding out via a failed/empty search. Uses Qdrant's scroll endpoint
   * with limit 1 - no query vector/embedding call needed, unlike
   * searchKnowledge.
   */
  public async hasIndexedContent(projectId: string): Promise<boolean> {
    return tracer.startActiveSpan('qdrant_has_indexed_content', async (span) => {
      span.setAttribute('qdrant.project_id', projectId);
      try {
        const res = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points/scroll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter: { must: [{ key: 'project_id', match: { value: projectId } }] },
            limit: 1,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const found = (data.result?.points || []).length > 0;
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return found;
        }
      } catch {
        // Fall through to in-memory check below.
      }

      const found = Array.from(this.inMemoryPoints.values()).some((d) => d.projectId === projectId);
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return found;
    });
  }

  /** Deletes every point for a project (re-indexing on rescan - see knowledgeBase.service.ts). */
  public async deleteProjectDocuments(projectId: string): Promise<void> {
    return tracer.startActiveSpan('qdrant_delete_project_documents', async (span) => {
      for (const [id, doc] of this.inMemoryPoints.entries()) {
        if (doc.projectId === projectId) this.inMemoryPoints.delete(id);
      }
      try {
        await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points/delete?wait=true`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filter: { must: [{ key: 'project_id', match: { value: projectId } }] } }),
        });
      } catch {
        // Best-effort - in-memory fallback is already cleared above.
      }
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    });
  }
}

export const qdrantService = new QdrantService();
