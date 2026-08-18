import { trace, SpanStatusCode } from '@opentelemetry/api';
import IORedis from 'ioredis';
import * as dotenv from 'dotenv';

// Self-sufficient regardless of import order (mirrors rateLimit.middleware.ts
// / embedding.service.ts - see HANDOFF.md §18 for the bug this pattern
// fixes). cache.service.ts is imported by creative.service.ts and
// cache.controller.ts, which can end up early in a given import chain -
// without calling this here too, process.env.REDIS_URL could silently read
// as undefined at module-load time below and lock this module into the
// in-memory fallback for its whole lifetime, with zero visible symptom.
dotenv.config();

const tracer = trace.getTracer('brandcore-cache-service');

export interface CacheEntry<T = any> {
  key: string;
  prompt: string;
  data: T;
  tokens: number;
  costUsd: number;
  vector: number[];
  createdAt: number;
  namespace: string;
}

export interface CacheCheckResult<T = any> {
  hit: boolean;
  type: 'exact' | 'semantic' | null;
  similarity: number;
  data: T | null;
  tokensSaved: number;
  costSaved: number;
}

const SIMILARITY_THRESHOLD = 0.85;

/**
 * Bounded eviction policy (HANDOFF.md §19). Previously this cache had no
 * TTL and no max size at all - it grew for as long as the process ran,
 * regardless of whether Redis is in the picture. `maxEntriesPerNamespace`
 * caps size with LRU eviction (oldest/least-recently-touched entry is
 * dropped first); `ttlMs` is a cheap second layer treating entries as stale
 * before the cap is even hit. Scoped **per namespace**, not globally -
 * the cache is already namespaced per (userId, brandDnaId) to prevent
 * cross-tenant leakage (see creative.service.ts), and a per-namespace cap
 * keeps that isolation meaningful instead of letting one very active brand
 * starve every other user's/brand's cache entries out of a shared global
 * limit. Held as a mutable object (not `const`s) so tests can shrink the
 * limits to something a test can actually push past in a handful of calls,
 * via `__setCacheLimitsForTesting` below - gated to NODE_ENV==='test' only.
 */
export const cacheLimits = {
  maxEntriesPerNamespace: Number(process.env.CACHE_MAX_ENTRIES_PER_NAMESPACE) || 200,
  ttlMs: Number(process.env.CACHE_TTL_MS) || 6 * 60 * 60 * 1000, // 6 hours
};

export function __setCacheLimitsForTesting(opts: { maxEntriesPerNamespace?: number; ttlMs?: number }): void {
  if (process.env.NODE_ENV !== 'test') return;
  if (opts.maxEntriesPerNamespace !== undefined) cacheLimits.maxEntriesPerNamespace = opts.maxEntriesPerNamespace;
  if (opts.ttlMs !== undefined) cacheLimits.ttlMs = opts.ttlMs;
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

/**
 * Backend-agnostic interface both the in-memory and Redis-backed engines
 * implement, so `SemanticCacheEngine` (the public `semanticCache` export)
 * can swap between them - and fall back from one to the other - without
 * any caller (creative.service.ts, cache.controller.ts) needing to know
 * which is actually active.
 */
interface CacheStore {
  check<T>(key: string, prompt: string, namespace: string): Promise<CacheCheckResult<T>>;
  set<T>(key: string, prompt: string, data: T, tokens: number, costUsd: number, namespace: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * In-memory backend. Always constructed (even in Redis mode) so a
 * transient Redis error degrades a single call to "less shared cache" for
 * that call, rather than throwing all the way up into a generation
 * request. Also the sole backend whenever REDIS_URL isn't configured.
 */
class InMemoryCacheStore implements CacheStore {
  // namespace -> (key -> entry). A plain Map preserves insertion order, and
  // JS re-inserts a key at the *end* of that order when you delete + set it
  // again - which is exactly what an LRU "touch on access" needs, with no
  // extra bookkeeping (no separate recency list, no timestamps to compare
  // for eviction order).
  private byNamespace = new Map<string, Map<string, CacheEntry>>();

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.createdAt > cacheLimits.ttlMs;
  }

  /** Moves `key` to the most-recently-used end of its namespace's map. */
  private touch(nsMap: Map<string, CacheEntry>, key: string, entry: CacheEntry): void {
    nsMap.delete(key);
    nsMap.set(key, entry);
  }

  async check<T>(key: string, prompt: string, namespace: string): Promise<CacheCheckResult<T>> {
    return tracer.startActiveSpan('cache_lookup', (span) => {
      span.setAttribute('cache.backend', 'memory');
      span.setAttribute('cache.key', key);
      span.setAttribute('cache.namespace', namespace);

      const nsMap = this.byNamespace.get(namespace);
      if (nsMap) {
        // 1. Exact match
        const exact = nsMap.get(key);
        if (exact) {
          if (this.isExpired(exact)) {
            nsMap.delete(key); // lazy TTL cleanup - fall through to miss/semantic path
          } else {
            this.touch(nsMap, key, exact);
            span.setAttribute('cache.result', 'exact_hit');
            span.setStatus({ code: SpanStatusCode.OK });
            span.end();
            const resHit: CacheCheckResult<T> = {
              hit: true,
              type: 'exact',
              similarity: 1.0,
              data: exact.data as T,
              tokensSaved: exact.tokens,
              costSaved: exact.costUsd,
            };
            return resHit;
          }
        }

        // 2. Semantic similarity check (if prompt provided)
        if (prompt && prompt.trim().length > 0) {
          let bestScore = 0;
          let bestKey: string | null = null;
          let bestEntry: CacheEntry | null = null;

          for (const [candidateKey, candidate] of nsMap.entries()) {
            if (this.isExpired(candidate)) continue; // cleaned up lazily below
            if (!candidate.prompt || candidate.prompt.trim().length === 0) continue;
            const { vec1, vec2 } = extractSemanticVectors(prompt, candidate.prompt);
            const score = cosineSimilarity(vec1, vec2);
            if (score > bestScore) {
              bestScore = score;
              bestKey = candidateKey;
              bestEntry = candidate;
            }
          }

          // Sweep expired entries found during the scan above.
          for (const [candidateKey, candidate] of Array.from(nsMap.entries())) {
            if (this.isExpired(candidate)) nsMap.delete(candidateKey);
          }

          span.setAttribute('cache.semantic.best_score', bestScore);

          if (bestScore >= SIMILARITY_THRESHOLD && bestEntry && bestKey) {
            this.touch(nsMap, bestKey, bestEntry);
            span.setAttribute('cache.result', 'semantic_hit');
            span.setStatus({ code: SpanStatusCode.OK });
            span.end();
            const resSemantic: CacheCheckResult<T> = {
              hit: true,
              type: 'semantic',
              similarity: bestScore,
              data: bestEntry.data as T,
              tokensSaved: bestEntry.tokens,
              costSaved: bestEntry.costUsd,
            };
            return resSemantic;
          }
        }
      }

      span.setAttribute('cache.result', 'miss');
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      const resMiss: CacheCheckResult<T> = { hit: false, type: null, similarity: 0, data: null, tokensSaved: 0, costSaved: 0 };
      return resMiss;
    });
  }

  async set<T>(key: string, prompt: string, data: T, tokens: number, costUsd: number, namespace: string): Promise<void> {
    let nsMap = this.byNamespace.get(namespace);
    if (!nsMap) {
      nsMap = new Map();
      this.byNamespace.set(namespace, nsMap);
    }

    const entry: CacheEntry<T> = {
      key,
      prompt,
      data,
      tokens,
      costUsd,
      vector: [],
      createdAt: Date.now(),
      namespace,
    };
    this.touch(nsMap, key, entry);

    // Bounded eviction: drop the least-recently-used entry(ies) in this
    // namespace once it exceeds the cap. Map iteration order is
    // insertion/touch order, so the first key is always the LRU victim.
    while (nsMap.size > cacheLimits.maxEntriesPerNamespace) {
      const oldestKey = nsMap.keys().next().value;
      if (oldestKey === undefined) break;
      nsMap.delete(oldestKey);
    }
  }

  async clear(): Promise<void> {
    this.byNamespace.clear();
  }
}

/**
 * Redis-backed store, used when REDIS_URL is configured - now that this
 * repo already runs real Redis for BullMQ (queue.service.ts) and the rate
 * limiter (rateLimit.middleware.ts), the "one-line store-swap, not worth it
 * today" deferral called out in HANDOFF.md §13/§15/§19 is made real here.
 *
 * Key scheme (namespace preserved exactly, matching the in-memory engine -
 * see the module docstring above on why per-namespace isolation matters):
 *  - `brandcore-cache:entry:{namespace}::{key}` - the cached value itself,
 *    a JSON-serialized CacheEntry, with a Redis TTL as the second eviction
 *    layer.
 *  - `brandcore-cache:ns:{namespace}` - a sorted set of that namespace's
 *    live keys, scored by "last touched" timestamp. Doubles as (a) the
 *    candidate list for the semantic scan and (b) the LRU eviction index -
 *    trimming the lowest-scored (oldest) members once the set exceeds the
 *    cap, exactly mirroring the in-memory Map's insertion-order eviction.
 */
class RedisCacheStore implements CacheStore {
  constructor(private redis: IORedis) {}

  private entryKey(namespace: string, key: string): string {
    return `brandcore-cache:entry:${namespace}::${key}`;
  }

  private nsIndexKey(namespace: string): string {
    return `brandcore-cache:ns:${namespace}`;
  }

  private ttlMs(): number {
    return Math.max(1, Math.ceil(cacheLimits.ttlMs));
  }

  /**
   * Bumps LRU recency (index score) and refreshes the entry's TTL.
   * Millisecond precision (`PEXPIRE`, not `EXPIRE`) deliberately - a
   * second-granularity TTL would round e.g. a 50ms test/debug TTL up to a
   * full second, silently making the cache's TTL layer behave differently
   * under Redis than it does in-memory.
   */
  private async touch(namespace: string, key: string): Promise<void> {
    await Promise.all([
      this.redis.pexpire(this.entryKey(namespace, key), this.ttlMs()),
      this.redis.zadd(this.nsIndexKey(namespace), Date.now(), key),
    ]);
  }

  async check<T>(key: string, prompt: string, namespace: string): Promise<CacheCheckResult<T>> {
    return tracer.startActiveSpan('cache_lookup', async (span) => {
      try {
        span.setAttribute('cache.backend', 'redis');
        span.setAttribute('cache.key', key);
        span.setAttribute('cache.namespace', namespace);

        // 1. Exact match
        const raw = await this.redis.get(this.entryKey(namespace, key));
        if (raw) {
          const entry: CacheEntry<T> = JSON.parse(raw);
          await this.touch(namespace, key);
          span.setAttribute('cache.result', 'exact_hit');
          span.setStatus({ code: SpanStatusCode.OK });
          const resHit: CacheCheckResult<T> = {
            hit: true,
            type: 'exact',
            similarity: 1.0,
            data: entry.data,
            tokensSaved: entry.tokens,
            costSaved: entry.costUsd,
          };
          return resHit;
        }

        // 2. Semantic scan over this namespace's currently-live members
        if (prompt && prompt.trim().length > 0) {
          const members = await this.redis.zrange(this.nsIndexKey(namespace), 0, -1);
          if (members.length > 0) {
            const rawValues = await this.redis.mget(members.map((m) => this.entryKey(namespace, m)));

            let bestScore = 0;
            let bestEntry: CacheEntry<T> | null = null;
            let bestKey: string | null = null;
            const staleMembers: string[] = [];

            members.forEach((member, i) => {
              const value = rawValues[i];
              if (!value) {
                // TTL-expired since it was indexed - self-heal the index.
                staleMembers.push(member);
                return;
              }
              const candidate: CacheEntry<T> = JSON.parse(value);
              const { vec1, vec2 } = extractSemanticVectors(prompt, candidate.prompt);
              const score = cosineSimilarity(vec1, vec2);
              if (score > bestScore) {
                bestScore = score;
                bestEntry = candidate;
                bestKey = member;
              }
            });

            if (staleMembers.length > 0) {
              await this.redis.zrem(this.nsIndexKey(namespace), ...staleMembers);
            }

            span.setAttribute('cache.semantic.best_score', bestScore);

            if (bestScore >= SIMILARITY_THRESHOLD && bestEntry && bestKey) {
              await this.touch(namespace, bestKey);
              span.setAttribute('cache.result', 'semantic_hit');
              span.setStatus({ code: SpanStatusCode.OK });
              const resSemantic: CacheCheckResult<T> = {
                hit: true,
                type: 'semantic',
                similarity: bestScore,
                data: (bestEntry as CacheEntry<T>).data,
                tokensSaved: (bestEntry as CacheEntry<T>).tokens,
                costSaved: (bestEntry as CacheEntry<T>).costUsd,
              };
              return resSemantic;
            }
          }
        }

        span.setAttribute('cache.result', 'miss');
        span.setStatus({ code: SpanStatusCode.OK });
        const resMiss: CacheCheckResult<T> = { hit: false, type: null, similarity: 0, data: null, tokensSaved: 0, costSaved: 0 };
        return resMiss;
      } catch (err: any) {
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        throw err;
      } finally {
        span.end();
      }
    });
  }

  async set<T>(key: string, prompt: string, data: T, tokens: number, costUsd: number, namespace: string): Promise<void> {
    return tracer.startActiveSpan('cache_store', async (span) => {
      try {
        span.setAttribute('cache.backend', 'redis');
        const entry: CacheEntry<T> = { key, prompt, data, tokens, costUsd, vector: [], createdAt: Date.now(), namespace };
        const nsKey = this.nsIndexKey(namespace);

        await this.redis.set(this.entryKey(namespace, key), JSON.stringify(entry), 'PX', this.ttlMs());

        // Every entry (not just ones with a prompt) goes into the
        // namespace index - it's the LRU/eviction tracker for *all*
        // entries, not only the semantic-candidate list. (The semantic
        // scan itself still only ever matches entries with a non-empty
        // prompt - see check() above - matching the in-memory engine's
        // single-Map design where the same structure backs both exact
        // lookups and semantic scanning.) An earlier version of this
        // gated this zadd on `prompt` being non-empty, which meant
        // exact-only entries (empty prompt, the common case for the
        // standalone /api/cache/* debug endpoints) never got tracked for
        // eviction at all - the cap silently never applied to them.
        await this.redis.zadd(nsKey, entry.createdAt, key);

        // Bounded eviction: trim this namespace's index back down to the
        // cap, deleting the actual entry keys for whatever got trimmed
        // (not just the index pointers - otherwise `entry:*` keys would
        // still accumulate unbounded even with a capped index).
        const size = await this.redis.zcard(nsKey);
        if (size > cacheLimits.maxEntriesPerNamespace) {
          const excess = size - cacheLimits.maxEntriesPerNamespace;
          const oldest = await this.redis.zrange(nsKey, 0, excess - 1);
          if (oldest.length > 0) {
            await Promise.all([
              this.redis.zrem(nsKey, ...oldest),
              this.redis.del(...oldest.map((k) => this.entryKey(namespace, k))),
            ]);
          }
        }

        span.setStatus({ code: SpanStatusCode.OK });
      } catch (err: any) {
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        throw err;
      } finally {
        span.end();
      }
    });
  }

  async clear(): Promise<void> {
    // Test/debug-only reset path (POST /api/usage/reset, and this file's
    // own test suite) - a SCAN-via-KEYS + DEL sweep is an acceptable
    // tradeoff here, same one tests/rateLimit.test.ts already makes for its
    // own Redis-backed cleanup; not on any hot request path.
    const keys = await this.redis.keys('brandcore-cache:*');
    if (keys.length > 0) await this.redis.del(...keys);
  }
}

/**
 * Public entry point (unchanged surface - `check`/`set`/`clear`, now
 * Promise-returning since a Redis-backed call is inherently async; every
 * caller already runs inside an async function, so this only meant adding
 * `await` at each call site, not restructuring anything).
 *
 * Picks its backend once at construction based on REDIS_URL (mirrors
 * rateLimit.middleware.ts / queue.service.ts): Redis-backed when
 * configured, in-memory otherwise. Also always keeps a private in-memory
 * store ready as a **per-call** fallback even in Redis mode - a transient
 * Redis error degrades that one check/set to "not shared across processes"
 * instead of throwing all the way up into a real generation-call-blocking
 * failure, matching every other Redis-dependent piece of this codebase.
 */
class SemanticCacheEngine {
  private store: CacheStore;
  private fallbackStore: CacheStore = new InMemoryCacheStore();
  private redisClient: IORedis | null = null;

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      this.redisClient = new IORedis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: false });
      this.redisClient.on('error', (err) => {
        console.warn(
          '[Cache] Redis connection error - individual calls fall back to the in-memory cache for this process until it recovers:',
          err.message
        );
      });
      this.store = new RedisCacheStore(this.redisClient);
    } else {
      this.store = this.fallbackStore;
    }
  }

  public async check<T>(key: string, prompt: string, namespace: string = ''): Promise<CacheCheckResult<T>> {
    if (this.store === this.fallbackStore) return this.store.check<T>(key, prompt, namespace);
    try {
      return await this.store.check<T>(key, prompt, namespace);
    } catch (err: any) {
      console.warn('[Cache] check() failed against Redis, falling back to in-memory for this call:', err.message);
      return this.fallbackStore.check<T>(key, prompt, namespace);
    }
  }

  public async set<T>(
    key: string,
    prompt: string,
    data: T,
    tokens: number,
    costUsd: number,
    namespace: string = ''
  ): Promise<void> {
    if (this.store === this.fallbackStore) return this.store.set<T>(key, prompt, data, tokens, costUsd, namespace);
    try {
      await this.store.set<T>(key, prompt, data, tokens, costUsd, namespace);
    } catch (err: any) {
      console.warn('[Cache] set() failed against Redis, falling back to in-memory for this call:', err.message);
      await this.fallbackStore.set<T>(key, prompt, data, tokens, costUsd, namespace);
    }
  }

  /** Resets all cached entries (used by tests and POST /api/usage/reset). */
  public async clear(): Promise<void> {
    await Promise.all([this.store.clear(), this.fallbackStore.clear()]);
  }

  /** True when this instance is actually backed by Redis (used by tests). */
  public isRedisBacked(): boolean {
    return this.store !== this.fallbackStore;
  }
}

export const semanticCache = new SemanticCacheEngine();
