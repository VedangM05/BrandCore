import request from 'supertest';
import app from '../src/app';
import { initializeDatabase, closeDatabase, cleanDatabase } from '../src/db';
import { semanticCache } from '../src/services/cache.service';
import { resetInMemoryUsage, setUserTier } from '../src/services/quota.service';

describe('Caching & Cost Control Integration Tests', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
    semanticCache.clear();
    resetInMemoryUsage();
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
        .send({
          key: 'launch-campaign-prod-1',
          prompt: 'Create a launch campaign for modern real estate platform Patronage Realtor',
          data: { headline: 'Find your dream home with Patronage Realtor' },
          tokens: 500,
          costUsd: 0.05
        });

      await request(app)
        .post('/api/cache/store')
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
      const testUser = 'overquota-user-id';
      // Set user to 'free' tier ($1.00 limit)
      await setUserTier(testUser, 'free');

      // 1. Consume usage up to near limit ($0.95)
      await request(app)
        .post('/api/cache/store')
        .set('x-user-id', testUser)
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
          .set('x-user-id', testUser)
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

  // Scenario 3: Near-Miss Semantic Values & False Positive Checks (5 checks to test 0% false positives)
  describe('Scenario 3: Near-Miss Semantic Values', () => {
    it('should ensure 0% false positive cache hit rate on low-similarity near-miss prompts', async () => {
      // Store reference prompt
      await request(app)
        .post('/api/cache/store')
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
      const billUser = 'billing-accuracy-user';
      await setUserTier(billUser, 'enterprise');

      const expectedTokens = 12500;
      const expectedCostUsd = 0.125000;

      await request(app)
        .post('/api/cache/store')
        .set('x-user-id', billUser)
        .send({
          key: 'bill-check-1',
          prompt: 'Billing accuracy check prompt',
          data: { status: 'billed' },
          tokens: expectedTokens,
          costUsd: expectedCostUsd
        });

      const statsRes = await request(app)
        .get(`/api/usage/stats?userId=${billUser}`);

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
});
