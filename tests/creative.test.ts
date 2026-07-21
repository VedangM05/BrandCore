import request from 'supertest';
import app from '../src/app';
import { initializeDatabase, cleanDatabase, closeDatabase, query } from '../src/db';

describe('Creative Generation Pipeline Integration Tests', () => {
  let brandDnaId: string;
  const latencies: number[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();

    // Seed a standard mock Brand DNA record for references
    const res = await query(
      `INSERT INTO crawl_results 
      (domain, url, title, meta_description, markdown_content, logo_url, colors, font_pairings, tone, dom_hierarchy, tagline, mission, audience, value_proposition)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
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
        'Spreading happiness through high-quality creative templates.'
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
    }, 15000);
  });
});
