import request from 'supertest';
import * as fs from 'fs';
import app from '../src/app';
import { initializeDatabase, cleanDatabase, closeDatabase, query } from '../src/db';
import { getTestAuthSession } from './helpers/testAuth';

// These tests hit the real (free, no-key) Pollinations/FLUX image provider over
// the network, so they're inherently slower than the rest of the suite and are
// given generous per-test timeouts. Keep slide/image counts small to stay fast.
describe('AI Photoshoot Integration Tests', () => {
  let brandDnaId: string;
  let authHeader: string;
  let testUserId: string;
  const generatedFilePaths: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
    await cleanDatabase();
    const session = await getTestAuthSession();
    authHeader = session.authHeader;
    testUserId = session.userId;

    const res = await query(
      `INSERT INTO crawl_results
      (domain, url, title, meta_description, markdown_content, logo_url, colors, font_pairings, tone, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        'sunnybrew.com',
        'http://sunnybrew.com',
        'Sunny Brew Coffee Co.',
        'Small-batch coffee roasted daily.',
        '# Sunny Brew',
        'http://sunnybrew.com/logo.png',
        ['#8a4b2f', '#f4b942'],
        'Georgia & Helvetica',
        'Warm, Craft & Friendly',
        testUserId
      ]
    );
    brandDnaId = res.rows[0].id;
  });

  afterAll(async () => {
    for (const filePath of generatedFilePaths) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {}
    }
    await closeDatabase();
  });

  describe('Auth and validation', () => {
    it('rejects unauthenticated requests to all three photoshoot routes with 401', async () => {
      const image = await request(app).post('/api/photoshoot/image').send({ brandDnaId, scenePrompt: 'x', style: 'Studio' });
      expect(image.status).toBe(401);

      const post = await request(app).post('/api/photoshoot/post').send({ brandDnaId, prompt: 'x' });
      expect(post.status).toBe(401);

      const carousel = await request(app).post('/api/photoshoot/carousel').send({ brandDnaId, prompt: 'x' });
      expect(carousel.status).toBe(401);
    });

    it('rejects missing required parameters with 400', async () => {
      const image = await request(app).post('/api/photoshoot/image').set('Authorization', authHeader).send({ scenePrompt: 'x' });
      expect(image.status).toBe(400);

      const post = await request(app).post('/api/photoshoot/post').set('Authorization', authHeader).send({ brandDnaId });
      expect(post.status).toBe(400);

      const carousel = await request(app).post('/api/photoshoot/carousel').set('Authorization', authHeader).send({ prompt: 'x' });
      expect(carousel.status).toBe(400);
    });
  });

  describe('Real image generation', () => {
    it(
      'generates a single scene image and persists it as an asset',
      async () => {
        const res = await request(app)
          .post('/api/photoshoot/image')
          .set('Authorization', authHeader)
          .send({ brandDnaId, scenePrompt: 'a cup of coffee on a rustic wooden table', style: 'Studio' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.asset.id).toBeDefined();
        expect(res.body.asset.filePath).toBeDefined();

        generatedFilePaths.push(res.body.asset.filePath);
        expect(fs.existsSync(res.body.asset.filePath)).toBe(true);
        expect(fs.statSync(res.body.asset.filePath).size).toBeGreaterThan(1000);

        const assetRow = await query('SELECT * FROM assets WHERE id = $1', [res.body.asset.id]);
        expect(assetRow.rows.length).toBe(1);
        expect(assetRow.rows[0].type).toBe('image');
        expect(assetRow.rows[0].brand_dna_id).toBe(brandDnaId);
      },
      // 180s (was 90s) - MAX_IMAGE_ATTEMPTS=2, each with a real Gemini
      // Vision QA call that's been observed taking 30-75s.
      180000
    );

    it(
      'generates a full campaign post with a composited headline image and a linked campaign row',
      async () => {
        const res = await request(app)
          .post('/api/photoshoot/post')
          .set('Authorization', authHeader)
          .send({ brandDnaId, prompt: 'Announce our new seasonal blend', channel: 'Meta ad' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.headline).toBeTruthy();
        expect(res.body.campaignId).toBeDefined();
        expect(res.body.asset.id).toBeDefined();

        generatedFilePaths.push(res.body.asset.filePath);
        expect(fs.existsSync(res.body.asset.filePath)).toBe(true);

        const campaignRow = await query('SELECT * FROM campaigns WHERE id = $1', [res.body.campaignId]);
        expect(campaignRow.rows.length).toBe(1);
        expect(campaignRow.rows[0].headline).toBe(res.body.headline);

        const assetRow = await query('SELECT * FROM assets WHERE id = $1', [res.body.asset.id]);
        expect(assetRow.rows[0].campaign_id).toBe(res.body.campaignId);
        expect(assetRow.rows[0].type).toBe('banner');
      },
      // 180s (was 90s) - same real Gemini Vision QA variance as the
      // cache-reuse test below (observed 30-75s per call).
      180000
    );

    it(
      'reuses cached copy/art on a repeat campaign post request instead of re-calling Gemini',
      async () => {
        const first = await request(app)
          .post('/api/photoshoot/post')
          .set('Authorization', authHeader)
          .send({ brandDnaId, prompt: 'Announce our anniversary sale', channel: 'Instagram' });
        expect(first.status).toBe(200);
        generatedFilePaths.push(first.body.asset.filePath);

        const second = await request(app)
          .post('/api/photoshoot/post')
          .set('Authorization', authHeader)
          .send({ brandDnaId, prompt: 'Announce our anniversary sale', channel: 'Instagram' });
        expect(second.status).toBe(200);
        generatedFilePaths.push(second.body.asset.filePath);

        // Same cached copy on both, even though each request still generates
        // its own fresh (free, unmetered) image for variety.
        expect(second.body.headline).toBe(first.body.headline);
        expect(second.body.bodyText).toBe(first.body.bodyText);
        expect(second.body.asset.id).not.toBe(first.body.asset.id);

        // DESC + LIMIT 2 (rather than filtering all rows for this
        // endpoint/user) because this file's beforeAll runs cleanDatabase
        // only once, not between individual `it`s - other tests in this
        // suite hit /api/photoshoot/post too, so only the most recent two
        // calls belong to this test.
        const usageRows = await query(
          `SELECT * FROM usage_logs WHERE user_id = $1 AND endpoint = '/api/photoshoot/post' ORDER BY created_at DESC LIMIT 2`,
          [testUserId]
        );
        expect(usageRows.rows.length).toBe(2);
        expect(usageRows.rows[0].cache_hit).toBe(true); // most recent = the repeat request
        expect(usageRows.rows[1].cache_hit).toBe(false);
      },
      // 300s (was 180s, was 90s) - this test does two full image+Vision-QA
      // cycles (cache miss then cache hit still regenerates the image for
      // variety - see the docstring above), and late in a long full-suite
      // run cumulative real API load pushes tail latency higher than any
      // single isolated call; observed 30-75s per QA call in isolation, up
      // to a full 180s+ for this specific two-cycle test under load.
      300000
    );

    it(
      'generates a multi-slide carousel with distinct grouped assets',
      async () => {
        const res = await request(app)
          .post('/api/photoshoot/carousel')
          .set('Authorization', authHeader)
          .send({ brandDnaId, prompt: 'Introduce our cold brew launch', slideCount: 2 });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.carouselId).toBeDefined();
        expect(res.body.slides).toHaveLength(2);

        for (const slide of res.body.slides) {
          expect(slide.headline).toBeTruthy();
          expect(slide.asset.id).toBeDefined();
          generatedFilePaths.push(slide.asset.filePath);
          expect(fs.existsSync(slide.asset.filePath)).toBe(true);
        }

        // Both slides must belong to the same carousel group but be distinct assets.
        const assetIds = res.body.slides.map((s: any) => s.asset.id);
        expect(new Set(assetIds).size).toBe(2);

        const assetRows = await query('SELECT * FROM assets WHERE id = ANY($1::uuid[])', [assetIds]);
        for (const row of assetRows.rows) {
          expect(row.type).toBe('carousel_slide');
          expect(row.meta_data.carouselId).toBe(res.body.carouselId);
        }
      },
      // 300s (was 150s) - two slides, each with a real image-generation +
      // real Gemini Vision QA round-trip; see the cache-reuse test's
      // comment above for the observed per-call variance.
      300000
    );
  });
});
