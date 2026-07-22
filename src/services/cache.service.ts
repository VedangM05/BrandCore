import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('brandcore-cache-service');

export interface CacheEntry<T = any> {
  key: string;
  prompt: string;
  data: T;
  tokens: number;
  costUsd: number;
  vector: number[];
  createdAt: number;
}

export interface CacheCheckResult<T = any> {
  hit: boolean;
  type: 'exact' | 'semantic' | null;
  similarity: number;
  data: T | null;
  tokensSaved: number;
  costSaved: number;
}

/**
 * Computes a term-frequency vector for semantic comparison.
 */
function computeTermVector(text: string, vocabulary: string[]): number[] {
  const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  const wordCount = new Map<string, number>();
  for (const w of words) {
    wordCount.set(w, (wordCount.get(w) || 0) + 1);
  }
  return vocabulary.map((term) => wordCount.get(term) || 0);
}

/**
 * Computes Cosine Similarity between two numerical vectors.
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length === 0 || vecB.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Builds a unified vocabulary from two texts and extracts feature vectors.
 */
function extractSemanticVectors(text1: string, text2: string): { vec1: number[]; vec2: number[] } {
  const words1 = text1.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  const words2 = text2.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  
  const vocabSet = new Set<string>([...words1, ...words2]);
  const vocabulary = Array.from(vocabSet);

  return {
    vec1: computeTermVector(text1, vocabulary),
    vec2: computeTermVector(text2, vocabulary)
  };
}

class SemanticCacheEngine {
  private exactCache = new Map<string, CacheEntry>();
  private cacheEntries: CacheEntry[] = [];
  private readonly SIMILARITY_THRESHOLD = 0.85;

  /**
   * Resets all cached entries (useful for testing).
   */
  public clear(): void {
    this.exactCache.clear();
    this.cacheEntries = [];
  }

  /**
   * Stores a new response in exact and semantic cache layers.
   */
  public set<T>(key: string, prompt: string, data: T, tokens: number, costUsd: number): void {
    const entry: CacheEntry<T> = {
      key,
      prompt,
      data,
      tokens,
      costUsd,
      vector: [],
      createdAt: Date.now()
    };
    this.exactCache.set(key, entry);
    // Add to semantic list if prompt is non-empty
    if (prompt && prompt.trim().length > 0) {
      this.cacheEntries.push(entry);
    }
  }

  /**
   * Performs layered exact and semantic cache check.
   */
  public check<T>(key: string, prompt: string): CacheCheckResult<T> {
    return tracer.startActiveSpan('cache_lookup', (span) => {
      span.setAttribute('cache.key', key);
      span.setAttribute('cache.prompt', prompt);

      // 1. Exact Match Check
      if (this.exactCache.has(key)) {
        const entry = this.exactCache.get(key)!;
        span.setAttribute('cache.result', 'exact_hit');
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        const resHit: CacheCheckResult<T> = {
          hit: true,
          type: 'exact',
          similarity: 1.0,
          data: entry.data,
          tokensSaved: entry.tokens,
          costSaved: entry.costUsd
        };
        return resHit;
      }

      // 2. Semantic Similarity Check (if prompt provided)
      if (prompt && prompt.trim().length > 0 && this.cacheEntries.length > 0) {
        let bestScore = 0;
        let bestEntry: CacheEntry | null = null;

        for (const candidate of this.cacheEntries) {
          const { vec1, vec2 } = extractSemanticVectors(prompt, candidate.prompt);
          const score = cosineSimilarity(vec1, vec2);
          if (score > bestScore) {
            bestScore = score;
            bestEntry = candidate;
          }
        }

        span.setAttribute('cache.semantic.best_score', bestScore);

        if (bestScore >= this.SIMILARITY_THRESHOLD && bestEntry) {
          span.setAttribute('cache.result', 'semantic_hit');
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          const resSemantic: CacheCheckResult<T> = {
            hit: true,
            type: 'semantic',
            similarity: bestScore,
            data: bestEntry.data,
            tokensSaved: bestEntry.tokens,
            costSaved: bestEntry.costUsd
          };
          return resSemantic;
        }
      }

      span.setAttribute('cache.result', 'miss');
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      const resMiss: CacheCheckResult<T> = {
        hit: false,
        type: null,
        similarity: 0,
        data: null,
        tokensSaved: 0,
        costSaved: 0
      };
      return resMiss;
    });
  }
}

export const semanticCache = new SemanticCacheEngine();
