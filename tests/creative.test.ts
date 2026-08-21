import request from 'supertest';
import app from '../src/app';
import { initializeDatabase, cleanDatabase, closeDatabase, query } from '../src/db';
import { getTestAuthSession } from './helpers/testAuth';
import { registerUser } from '../src/services/auth.service';
import { semanticCache } from '../src/services/cache.service';

describe('Creative Generation Pipeline Integration Tests', () => {
  let brandDnaId: string;
  let authHeader: string;
  let testUserId: string;
  const latencies: number[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
    await semanticCache.clear();
    const session = await getTestAuthSession();
    authHeader = session.authHeader;
    testUserId = session.userId;

    // Seed a standard mock Brand DNA record for references
    const res = await query(
      `INSERT INTO crawl_results
      (domain, url, title, meta_description, markdown_content, logo_url, colors, font_pairings, tone, dom_hierarchy, tagline, mission, audience, value_proposition, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
      [
        'happybrand.com',
        'http://happybrand.com',
        'Happy Brand Corporation',
        'The happiest brand on earth.',
        '# Happy Brand',
        'http://happybrand.com/logo.png',
        ['#4f46e5', '#f97316', '#0ea5e9', '#10b981'],
        'Plus Jakarta Sans & Inter',
        'Cheerful, Friendly & Professional',
        JSON.stringify([]),
        'Keep smiling.',
        'To make the world a happier place.',
        'General public and values-driven communities.',
        'Spreading happiness through high-quality creative templates.',
        testUserId
      ]
    );
    brandDnaId = res.rows[0].id;
  });

  afterAll(async () => {
    await closeDatabase();

    // Compile & Output Quantitative metrics
    const sorted = [...latencies].sort((a, b) => a - b);
    const p95Idx = Math.floor(sorted.length * 0.95);
    const p95 = sorted[p95Idx] || 0;
    console.log(`[PIPELINE LATENCY REPORT] p95 generation latency: ${p95.toFixed(2)}ms across ${latencies.length} runs`);
  });

  // Scenario Matrix: 20 distinct runs across 3 scenarios
  // 8 Happy Path runs (score: 95)
  // 6 Bounded QA retry runs (scores: [55, 90])
  // 6 Fallback runs (scores: [50, 60, 55])
  const testMatrix = [
    { id: 1, scenario: 'Happy Path', sequence: [95], expectedAttempts: 1 },
    { id: 2, scenario: 'Happy Path', sequence: [85], expectedAttempts: 1 },
    { id: 3, scenario: 'Happy Path', sequence: [90], expectedAttempts: 1 },
    { id: 4, scenario: 'Happy Path', sequence: [80], expectedAttempts: 1 },
    { id: 5, scenario: 'Happy Path', sequence: [92], expectedAttempts: 1 },
    { id: 6, scenario: 'Happy Path', sequence: [88], expectedAttempts: 1 },
    { id: 7, scenario: 'Happy Path', sequence: [81], expectedAttempts: 1 },
    { id: 8, scenario: 'Happy Path', sequence: [99], expectedAttempts: 1 },

    { id: 9, scenario: 'QA Retry Loop', sequence: [60, 85], expectedAttempts: 2 },
    { id: 10, scenario: 'QA Retry Loop', sequence: [70, 92], expectedAttempts: 2 },
    { id: 11, scenario: 'QA Retry Loop', sequence: [55, 80], expectedAttempts: 2 },
    { id: 12, scenario: 'QA Retry Loop', sequence: [79, 90], expectedAttempts: 2 },
    { id: 13, scenario: 'QA Retry Loop', sequence: [40, 75, 82], expectedAttempts: 3 },
    { id: 14, scenario: 'QA Retry Loop', sequence: [50, 50, 95], expectedAttempts: 3 },

    { id: 15, scenario: 'Best-of-N Fallback', sequence: [50, 70, 60], expectedAttempts: 3, expectedScore: 70 },
    { id: 16, scenario: 'Best-of-N Fallback', sequence: [30, 40, 50], expectedAttempts: 3, expectedScore: 50 },
    { id: 17, scenario: 'Best-of-N Fallback', sequence: [75, 45, 60], expectedAttempts: 3, expectedScore: 75 },
    { id: 18, scenario: 'Best-of-N Fallback', sequence: [20, 72, 50], expectedAttempts: 3, expectedScore: 72 },
    { id: 19, scenario: 'Best-of-N Fallback', sequence: [65, 68, 55], expectedAttempts: 3, expectedScore: 68 },
    { id: 20, scenario: 'Best-of-N Fallback', sequence: [55, 52, 59], expectedAttempts: 3, expectedScore: 59 }
  ];

  testMatrix.forEach(({ id, scenario, sequence, expectedAttempts, expectedScore }) => {
    it(`Run ${id} [${scenario}]: should run execution and verify nodes & constraints`, async () => {
      const startTime = Date.now();

      const res = await request(app)
        .post('/api/creative/generate')
        .set('Authorization', authHeader)
        .send({
          brandDnaId,
          prompt: `Create a launch campaign for product ${id}`,
          forceScoreSequence: sequence
        });

      const duration = Date.now() - startTime;
      latencies.push(duration);

      expect(res.status).toBe(200);
      expect(res.body.brandDnaId).toBe(brandDnaId);
      expect(res.body.copy.headline).toBeTruthy();
      expect(res.body.copy.bodyText).toBeTruthy();
      expect(res.body.copy.socialCopy).toBeTruthy();
      expect(res.body.art.imagePrompt).toBeTruthy();
      expect(res.body.art.visualStyle).toBeTruthy();
      expect(res.body.attempts).toBe(expectedAttempts);

      // Verify that retry count matches scenario expectations (and never exceeds MAX_RETRIES = 3)
      expect(res.body.attempts).toBeLessThanOrEqual(3);

      if (expectedScore !== undefined) {
        // Fallback selects the best score from the retries
        expect(res.body.qa.score).toBe(expectedScore);
      } else {
        // Happy path or successful retries must meet passing criteria (>= 80)
        expect(res.body.qa.score).toBeGreaterThanOrEqual(80);
      }

      // Verify DB storage
      const campaignsRes = await query('SELECT * FROM campaigns WHERE id = $1', [res.body.id]);
      expect(campaignsRes.rows.length).toBe(1);
      
      const row = campaignsRes.rows[0];
      expect(row.headline).toBe(res.body.copy.headline);
      expect(row.image_prompt).toBe(res.body.art.imagePrompt);
      expect(row.qa_score).toBe(res.body.qa.score);
      // 45s (was 15s) - now that gemini-flash-latest actually resolves (see
      // geminiModels.ts), the QA-retry/best-of-N scenarios genuinely make
      // up to 3 sequential rounds of real copy+art+QA network calls instead
      // of instantly falling back to local heuristics on a fast 404.
    }, 45000);
  });

  // Campaign idea suggestions - grounds the "blank prompt box" problem in the
  // brand's own DNA rather than requiring the user to write from scratch.
  describe('GET /api/creative/ideas', () => {
    it('returns campaign angles grounded in the brand DNA', async () => {
      const res = await request(app)
        .get(`/api/creative/ideas?brandDnaId=${brandDnaId}`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.ideas).toBeInstanceOf(Array);
      expect(res.body.ideas.length).toBeGreaterThan(0);
      for (const idea of res.body.ideas) {
        expect(idea.angle).toBeTruthy();
        expect(idea.prompt).toBeTruthy();
      }
    });

    it('rejects a request with no brandDnaId with 400', async () => {
      const res = await request(app).get('/api/creative/ideas').set('Authorization', authHeader);
      expect(res.status).toBe(400);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get(`/api/creative/ideas?brandDnaId=${brandDnaId}`);
      expect(res.status).toBe(401);
    });
  });

  // Semantic/exact-match cache wired directly into executeCreativePipeline
  // (see creative.service.ts) - a repeat/near-duplicate request should skip
  // the Copywriter/Art Director/QA pipeline entirely and reuse the prior
  // result, scoped per (user, brand) so it can never leak across tenants.
  describe('Cache wiring in the generation pipeline', () => {
    it('serves an identical repeat request from cache (exact match) with a matching campaign row', async () => {
      const first = await request(app)
        .post('/api/creative/generate')
        .set('Authorization', authHeader)
        .send({ brandDnaId, prompt: 'Announce our new product line', channel: 'Instagram' });
      expect(first.status).toBe(200);

      const second = await request(app)
        .post('/api/creative/generate')
        .set('Authorization', authHeader)
        .send({ brandDnaId, prompt: 'Announce our new product line', channel: 'Instagram' });
      expect(second.status).toBe(200);
      expect(second.body.attempts).toBe(0); // no fresh Copywriter/Art Director/QA run
      expect(second.body.copy.headline).toBe(first.body.copy.headline);
      expect(second.body.copy.bodyText).toBe(first.body.copy.bodyText);

      const usageRows = await query(
        `SELECT * FROM usage_logs WHERE user_id = $1 AND endpoint = '/api/creative/generate' ORDER BY created_at ASC`,
        [testUserId]
      );
      expect(usageRows.rows.length).toBe(2);
      expect(usageRows.rows[0].cache_hit).toBe(false);
      expect(usageRows.rows[1].cache_hit).toBe(true);
      expect(Number(usageRows.rows[1].cost_usd)).toBe(0);

      const campaignRows = await query('SELECT attempts FROM campaigns WHERE brand_dna_id = $1 ORDER BY created_at ASC', [brandDnaId]);
      expect(campaignRows.rows.length).toBe(2);
      expect(campaignRows.rows[1].attempts).toBe(0);
    }, 20000);

    it('does not cache-hit across two different users, even for the same prompt text', async () => {
      const otherUserId = await registerUser('cache-isolation-owner@brandcore.com', 'password123');
      const otherSession = await getTestAuthSession('cache-isolation-owner@brandcore.com', 'password123');

      const otherDnaRes = await query(
        `INSERT INTO crawl_results (domain, url, title, tone, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        ['otherbrand.com', 'http://otherbrand.com', 'Other Brand', 'Bold', otherUserId]
      );
      const otherBrandDnaId = otherDnaRes.rows[0].id;

      await request(app)
        .post('/api/creative/generate')
        .set('Authorization', authHeader)
        .send({ brandDnaId, prompt: 'Cross-tenant cache probe prompt', channel: 'Email' });

      const otherRes = await request(app)
        .post('/api/creative/generate')
        .set('Authorization', otherSession.authHeader)
        .send({ brandDnaId: otherBrandDnaId, prompt: 'Cross-tenant cache probe prompt', channel: 'Email' });

      expect(otherRes.status).toBe(200);
      expect(otherRes.body.attempts).toBeGreaterThan(0); // a real generation, not a cache hit from the first user

      const otherUsageRows = await query(
        `SELECT * FROM usage_logs WHERE user_id = $1 AND endpoint = '/api/creative/generate'`,
        [otherUserId]
      );
      expect(otherUsageRows.rows.length).toBe(1);
      expect(otherUsageRows.rows[0].cache_hit).toBe(false);
    }, 20000);

    it('does not cache-hit across two different channels for the same prompt', async () => {
      // Regression test: channel used to only be a prefix inside the cache
      // key/semantic prompt, not part of the cache namespace. The semantic
      // similarity scan (cache.service.ts) ignores key content and matches
      // anything above the threshold within a namespace, so "Twitter/X
      // <prompt>" and "LinkedIn <prompt>" (same long shared prompt, one
      // differing word) scored above SIMILARITY_THRESHOLD and cross-hit -
      // every channel silently returned the first channel's copy.
      const first = await request(app)
        .post('/api/creative/generate')
        .set('Authorization', authHeader)
        .send({ brandDnaId, prompt: 'Announce our summer sale event', channel: 'Twitter/X' });
      expect(first.status).toBe(200);

      const second = await request(app)
        .post('/api/creative/generate')
        .set('Authorization', authHeader)
        .send({ brandDnaId, prompt: 'Announce our summer sale event', channel: 'LinkedIn' });
      expect(second.status).toBe(200);

      const usageRows = await query(
        `SELECT * FROM usage_logs WHERE user_id = $1 AND endpoint = '/api/creative/generate' ORDER BY created_at ASC`,
        [testUserId]
      );
      expect(usageRows.rows.length).toBe(2);
      // Both channels must be real generations - neither should reuse the
      // other's cached copy just because the rest of the prompt matches.
      expect(usageRows.rows[0].cache_hit).toBe(false);
      expect(usageRows.rows[1].cache_hit).toBe(false);

      // Same channel repeated afterwards must still correctly cache-hit -
      // the fix must not have broken same-channel caching in the process.
      const third = await request(app)
        .post('/api/creative/generate')
        .set('Authorization', authHeader)
        .send({ brandDnaId, prompt: 'Announce our summer sale event', channel: 'Twitter/X' });
      expect(third.status).toBe(200);
      expect(third.body.copy.headline).toBe(first.body.copy.headline);

      const finalUsageRows = await query(
        `SELECT cache_hit FROM usage_logs WHERE user_id = $1 AND endpoint = '/api/creative/generate' ORDER BY created_at ASC`,
        [testUserId]
      );
      expect(finalUsageRows.rows.length).toBe(3);
      expect(finalUsageRows.rows[2].cache_hit).toBe(true);
    }, 30000);
  });

  // forceScoreSequence exists purely to let the scenario tests above drive
  // the QA retry/best-of-N paths deterministically - it must never be
  // honored outside test mode, or any authenticated user could force their
  // own content past Brand QA on a real request (see handleCreativeGenerate).
  describe('forceScoreSequence is a test-only input', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('is ignored outside test mode - a forced low score does not force a rejection', async () => {
      process.env.NODE_ENV = 'production';
      try {
        const res = await request(app)
          .post('/api/creative/generate')
          .set('Authorization', authHeader)
          .send({ brandDnaId, prompt: 'Announce a limited-time discount', channel: 'Email', forceScoreSequence: [45] });

        expect(res.status).toBe(200);
        // If forceScoreSequence had been honored, the score would be
        // exactly 45 and best-of-N fallback would trigger after 3 rejected
        // attempts. Real (unforced) QA - via judgeTextWithGemini, or its
        // approve-with-caveat degradation if no key/call failure - never
        // produces exactly 45.
        expect(res.body.qa.score).not.toBe(45);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    }, 20000);
  });
});
