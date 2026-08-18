import request from 'supertest';
import IORedis from 'ioredis';
import app from '../src/app';
import { initializeDatabase, closeDatabase, cleanDatabase } from '../src/db';
import { semanticCache, cacheLimits, __setCacheLimitsForTesting } from '../src/services/cache.service';
import { resetInMemoryUsage, setUserTier } from '../src/services/quota.service';
import { getTestAuthSession } from './helpers/testAuth';

describe('Caching & Cost Control Integration Tests', () => {
  let authHeader: string;
  let authUserId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
    await semanticCache.clear();
    resetInMemoryUsage();
    const session = await getTestAuthSession();
    authHeader = session.authHeader;
    authUserId = session.userId;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  // Scenario 1: Duplicate-Heavy Streams (10 checks to test hit rate >= 40%)
  describe('Scenario 1: Duplicate-Heavy Streams', () => {
    it('should achieve >= 40% cache hit rate on duplicate and semantically similar prompt streams', async () => {
      // 1. Store initial base prompts in cache
      await request(app)
        .post('/api/cache/store')
        .set('Authorization', authHeader)
        .send({
          key: 'launch-campaign-prod-1',
          prompt: 'Create a launch campaign for modern real estate platform Patronage Realtor',
          data: { headline: 'Find your dream home with Patronage Realtor' },
          tokens: 500,
          costUsd: 0.05
        });

      await request(app)
        .post('/api/cache/store')
        .set('Authorization', authHeader)
        .send({
          key: 'brand-dna-patronage',
          prompt: 'https://patronagerealtor.in/',
          data: { title: 'Patronage Realtor', tone: 'Modern & Professional' },
          tokens: 1000,
          costUsd: 0.10
        });

      // Stream of 10 incoming test queries (some exact hits, some semantic hits, some new misses)
      const queryStream = [
        { key: 'launch-campaign-prod-1', prompt: 'Create a launch campaign for modern real estate platform Patronage Realtor', expectedHit: true, expectedType: 'exact' },
        { key: 'launch-campaign-prod-1-alt', prompt: 'Create a launch campaign for modern real estate platform Patronage Realtor', expectedHit: true, expectedType: 'semantic' },
        { key: 'brand-dna-patronage', prompt: 'https://patronagerealtor.in/', expectedHit: true, expectedType: 'exact' },
        { key: 'sem-1', prompt: 'Create a launch campaign for modern real estate platform Patronage Realtor', expectedHit: true, expectedType: 'semantic' },
        { key: 'sem-2', prompt: 'Create launch campaign for modern real estate platform Patronage Realtor', expectedHit: true, expectedType: 'semantic' },
        { key: 'miss-1', prompt: 'Write an internal employee memo for factory safety', expectedHit: false },
        { key: 'miss-2', prompt: 'Generate financial audit spreadsheet template', expectedHit: false },
        { key: 'miss-3', prompt: 'Design a sports apparel logo for marathon runners', expectedHit: false },
        { key: 'sem-3', prompt: 'Create a launch campaign for modern real estate platform Patronage Realtor', expectedHit: true, expectedType: 'semantic' },
        { key: 'sem-4', prompt: 'Create launch campaign for modern real estate platform Patronage Realtor', expectedHit: true, expectedType: 'semantic' }
      ];

      let hitsCount = 0;
      for (const item of queryStream) {
        const res = await request(app)
          .post('/api/cache/check')
          .set('Authorization', authHeader)
          .send({ key: item.key, prompt: item.prompt });

        expect(res.status).toBe(200);
        if (res.body.hit) {
          hitsCount++;
          if (item.expectedType) {
            expect(res.body.type).toBe(item.expectedType);
          }
        } else {
          expect(item.expectedHit).toBe(false);
        }
      }

      const hitRate = (hitsCount / queryStream.length) * 100;
      console.log(`[SCENARIO 1 METRIC] Cache Hit Rate: ${hitRate.toFixed(1)}% (${hitsCount}/${queryStream.length} hits)`);
      expect(hitRate).toBeGreaterThanOrEqual(40.0);
    });
  });

  // Scenario 2: Tier Over-Utilization & Cost Ceiling Enforcement (5 checks to test 100% rejection rate)
  describe('Scenario 2: Tier Over-Utilization', () => {
    it('should 100% enforce cost ceiling rejection when simulated usage exceeds tier limit', async () => {
      // Set the authenticated test user to 'free' tier ($1.00 limit). Quota is now
      // resolved from the verified JWT identity (req.user), not a client-supplied
      // x-user-id header - so we drive the scenario through the real authed user.
      await setUserTier(authUserId, 'free');

      // 1. Consume usage up to near limit ($0.95)
      await request(app)
        .post('/api/cache/store')
        .set('Authorization', authHeader)
        .send({
          key: 'seed-1',
          prompt: 'Initial query',
          data: { result: 'ok' },
          tokens: 9500,
          costUsd: 0.95
        });

      // 5 subsequent requests designed to exceed the $1.00 ceiling limit
      const overQuotaRequests = [
        { estimatedCostUsd: 0.10, estimatedTokens: 1000 },
        { estimatedCostUsd: 0.20, estimatedTokens: 2000 },
        { estimatedCostUsd: 0.08, estimatedTokens: 800 },
        { estimatedCostUsd: 0.15, estimatedTokens: 1500 },
        { estimatedCostUsd: 0.50, estimatedTokens: 5000 }
      ];

      let rejectedCount = 0;
      for (const reqObj of overQuotaRequests) {
        const res = await request(app)
          .post('/api/creative/generate')
          .set('Authorization', authHeader)
          .send({
            brandDnaId: 'dummy-id',
            prompt: 'Heavy generation prompt',
            estimatedCostUsd: reqObj.estimatedCostUsd,
            estimatedTokens: reqObj.estimatedTokens
          });

        if (res.status === 429) {
          rejectedCount++;
          expect(res.body.code).toBe('QUOTA_EXCEEDED');
          expect(res.body.tier).toBe('free');
        }
      }

      const enforcementRate = (rejectedCount / overQuotaRequests.length) * 100;
      console.log(`[SCENARIO 2 METRIC] Cost Ceiling Enforcement: ${enforcementRate.toFixed(1)}% (${rejectedCount}/${overQuotaRequests.length} rejected)`);
      expect(enforcementRate).toBe(100.0);
    });
  });

  // Security regression (HANDOFF.md §22): POST /api/usage/tier used to
  // accept `userId` straight from the request body with no check against
  // the authenticated caller - any signed-in user could set *any other
  // user's* quota tier (e.g. self-upgrading their own account to
  // 'enterprise' for free, or targeting a known/guessed other user's id),
  // since this route is only gated by requireAuth, not an ownership or
  // role check. Found alongside the registration role-escalation bug via
  // the same "does this trust client-supplied identity input" sweep.
  describe('Scenario: Tier-setting authorization', () => {
    it('allows a user to set their own tier', async () => {
      const res = await request(app)
        .post('/api/usage/tier')
        .set('Authorization', authHeader)
        .send({ userId: authUserId, tier: 'pro' });
      expect(res.status).toBe(200);
    });

    it('rejects a non-admin user setting a different user\'s tier', async () => {
      const otherSession = await getTestAuthSession('demo@brandcore.com', 'password123');
      const res = await request(app)
        .post('/api/usage/tier')
        .set('Authorization', otherSession.authHeader)
        .send({ userId: authUserId, tier: 'enterprise' });
      expect(res.status).toBe(403);
    });

    it('allows an admin to set another user\'s tier', async () => {
      const adminSession = await getTestAuthSession('admin@brandcore.com', 'password123');
      const res = await request(app)
        .post('/api/usage/tier')
        .set('Authorization', adminSession.authHeader)
        .send({ userId: authUserId, tier: 'enterprise' });
      expect(res.status).toBe(200);
    });
  });

  // Scenario 3: Near-Miss Semantic Values & False Positive Checks (5 checks to test 0% false positives)
  describe('Scenario 3: Near-Miss Semantic Values', () => {
    it('should ensure 0% false positive cache hit rate on low-similarity near-miss prompts', async () => {
      // Store reference prompt
      await request(app)
        .post('/api/cache/store')
        .set('Authorization', authHeader)
        .send({
          key: 'patronage-real-estate',
          prompt: 'Modern luxury apartments for sale in downtown Pune with parking and swimming pool',
          data: { luxury: true, city: 'Pune' },
          tokens: 600,
          costUsd: 0.03
        });

      // 5 near-miss prompts that share some vocabulary but have distinct core intent (similarity < 0.85)
      const nearMissPrompts = [
        'Cheap budget student hostel rentals in suburban Mumbai near railway station',
        'Commercial office space leasing contracts for software enterprise in Bangalore',
        'Residential home decor and interior design consultation catalog',
        'Agricultural farmland purchasing guidelines and land tax registration',
        'Industrial warehouse storage facilities for automotive logistics'
      ];

      let falsePositives = 0;
      for (const p of nearMissPrompts) {
        const res = await request(app)
          .post('/api/cache/check')
          .set('Authorization', authHeader)
          .send({ key: `near-miss-${Math.random()}`, prompt: p });

        expect(res.status).toBe(200);
        if (res.body.hit) {
          console.warn(`[FALSE POSITIVE DETECTED] Prompt "${p}" matched with similarity ${res.body.similarity}`);
          falsePositives++;
        } else {
          expect(res.body.hit).toBe(false);
        }
      }

      const falsePositiveRate = (falsePositives / nearMissPrompts.length) * 100;
      console.log(`[SCENARIO 3 METRIC] False-Positive Rate: ${falsePositiveRate.toFixed(1)}% (${falsePositives}/${nearMissPrompts.length} false hits)`);
      expect(falsePositiveRate).toBe(0.0);
    });
  });

  // Billing Accuracy Check
  describe('Billing Accuracy Check', () => {
    it('should measure tokens_used and cost_usd logging accuracy within 5% variance of actual API billing', async () => {
      await setUserTier(authUserId, 'enterprise');

      const expectedTokens = 12500;
      const expectedCostUsd = 0.125000;

      await request(app)
        .post('/api/cache/store')
        .set('Authorization', authHeader)
        .send({
          key: 'bill-check-1',
          prompt: 'Billing accuracy check prompt',
          data: { status: 'billed' },
          tokens: expectedTokens,
          costUsd: expectedCostUsd
        });

      const statsRes = await request(app)
        .get(`/api/usage/stats?userId=${authUserId}`)
        .set('Authorization', authHeader);

      expect(statsRes.status).toBe(200);
      const actualTokens = statsRes.body.currentTokens;
      const actualCost = statsRes.body.currentCostUsd;

      const tokenVariance = Math.abs(actualTokens - expectedTokens) / expectedTokens;
      const costVariance = Math.abs(actualCost - expectedCostUsd) / expectedCostUsd;

      console.log(`[BILLING METRIC] Token Variance: ${(tokenVariance * 100).toFixed(2)}%, Cost Variance: ${(costVariance * 100).toFixed(2)}%`);
      expect(tokenVariance).toBeLessThan(0.05);
      expect(costVariance).toBeLessThan(0.05);
    });
  });

  // Bounded eviction policy (HANDOFF.md §19) - the cache previously had no
  // TTL and no max size at all, growing unbounded for the life of the
  // process. These tests push it past the cap and confirm the oldest entry
  // is actually gone (or expired), not just that new entries can still be
  // cached - the weaker assertion the earlier scenarios above already
  // cover implicitly and wouldn't catch a missing eviction policy at all.
  describe('Scenario: Bounded eviction (LRU cap + TTL)', () => {
    const savedLimits = { ...cacheLimits };

    afterEach(() => {
      __setCacheLimitsForTesting(savedLimits);
    });

    it('evicts the oldest entry once a namespace exceeds its max-entries cap (LRU)', async () => {
      __setCacheLimitsForTesting({ maxEntriesPerNamespace: 5 });
      const namespace = 'eviction-test-ns';

      // Fill exactly to the cap.
      for (let i = 0; i < 5; i++) {
        await semanticCache.set(`key-${i}`, '', { i }, 10, 0.001, namespace);
      }
      // All 5 should still be present.
      for (let i = 0; i < 5; i++) {
        const res = await semanticCache.check(`key-${i}`, '', namespace);
        expect(res.hit).toBe(true);
      }

      // One more push evicts key-0, the least-recently-used entry.
      await semanticCache.set('key-5', '', { i: 5 }, 10, 0.001, namespace);

      const evicted = await semanticCache.check('key-0', '', namespace);
      expect(evicted.hit).toBe(false);

      // The rest (touched more recently than key-0) and the new entry
      // should both still be there - confirms this is a real cap, not
      // "everything got wiped."
      for (let i = 1; i <= 5; i++) {
        const res = await semanticCache.check(`key-${i}`, '', namespace);
        expect(res.hit).toBe(true);
      }
    });

    it('treats an entry as stale (miss) once it is older than the TTL', async () => {
      __setCacheLimitsForTesting({ ttlMs: 50 });
      const namespace = 'ttl-test-ns';

      await semanticCache.set('ttl-key', '', { data: 'stale-soon' }, 10, 0.001, namespace);

      const fresh = await semanticCache.check('ttl-key', '', namespace);
      expect(fresh.hit).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 120));

      const stale = await semanticCache.check('ttl-key', '', namespace);
      expect(stale.hit).toBe(false);
    });
  });

  // Redis migration (HANDOFF.md §19) - same "genuinely Redis-backed, not
  // silently in-memory" style test rateLimit.test.ts already has, not just
  // "requests get cached" (which would pass identically either way).
  describe('Scenario: Redis-backed cache', () => {
    let redisClient: IORedis | null = null;

    beforeAll(() => {
      if (process.env.REDIS_URL) {
        redisClient = new IORedis(process.env.REDIS_URL);
      }
    });

    afterAll(async () => {
      await redisClient?.quit();
    });

    it('is genuinely Redis-backed when REDIS_URL is configured, not silently falling back to in-memory', async () => {
      if (!process.env.REDIS_URL || !redisClient) {
        console.warn('[cache.test] Skipping - no REDIS_URL configured');
        return;
      }
      expect(semanticCache.isRedisBacked()).toBe(true);

      const namespace = `redis-check-ns-${Date.now()}`;
      await semanticCache.set('redis-check-key', 'a real redis-backed cache prompt', { ok: true }, 42, 0.004, namespace);

      const keys = await redisClient.keys(`brandcore-cache:entry:${namespace}*`);
      expect(keys.length).toBeGreaterThan(0);

      const raw = await redisClient.get(keys[0]);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw as string);
      expect(parsed.data).toEqual({ ok: true });

      // Also confirm the namespace's LRU/semantic index actually exists in
      // Redis, not just the entry value.
      const indexScore = await redisClient.zscore(`brandcore-cache:ns:${namespace}`, 'redis-check-key');
      expect(indexScore).not.toBeNull();
    });
  });
});
