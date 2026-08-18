import request from 'supertest';
import app from '../src/app';
import { initializeDatabase, cleanDatabase, closeDatabase, query } from '../src/db';
import fs from 'fs';
import path from 'path';
import { getTestAuthSession, getTestAuthHeader } from './helpers/testAuth';

describe('Asset Library & History Module Integration Tests', () => {
  let brandDnaId: string;
  let campaignId: string;
  let authHeader: string;
  let testUserId: string;
  const sampleAssetIds: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
    await cleanDatabase();
    const session = await getTestAuthSession();
    authHeader = session.authHeader;
    testUserId = session.userId;

    // 1. Seed brand DNA record
    const dnaRes = await query(
      `INSERT INTO crawl_results (domain, url, title, colors, tone, user_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      ['example.com', 'https://example.com', 'Example Brand', ['#000000', '#ffffff'], 'Modern', testUserId]
    );
    brandDnaId = dnaRes.rows[0].id;

    // 2. Seed campaign record
    const campaignRes = await query(
      `INSERT INTO campaigns (brand_dna_id, prompt, headline, user_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [brandDnaId, 'Summer Campaign', 'Summer Product Launch', testUserId]
    );
    campaignId = campaignRes.rows[0].id;

    // 3. Create dummy physical files for streaming tests
    const storageDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    // Seed 100 assets for performance benchmark (gallery load < 1s)
    for (let i = 0; i < 100; i++) {
      const fileName = `test_asset_${i}_${Date.now()}.png`;
      const filePath = path.join(storageDir, fileName);
      fs.writeFileSync(filePath, Buffer.from(`FAKE_IMAGE_DATA_CONTENT_${i}`));

      const isHero = i % 4 === 0;
      const isBanner = i % 2 === 0;
      const tags = ['marketing'];
      if (isHero) tags.push('hero');
      if (isBanner) tags.push('banner');

      const assetRes = await query(
        `INSERT INTO assets (brand_dna_id, campaign_id, name, type, file_path, mime_type, file_size, tags, meta_data, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          brandDnaId,
          campaignId,
          `Asset ${i} - ${isHero ? 'Hero Banner Launch' : 'Standard Component'}`,
          isBanner ? 'image' : 'document',
          filePath,
          'image/png',
          1024 + i,
          tags,
          JSON.stringify({ width: 1920, height: 1080 }),
          testUserId
        ]
      );
      sampleAssetIds.push(assetRes.rows[0].id);
    }
  });

  afterAll(async () => {
    // Clean up created files
    const storageDir = path.join(process.cwd(), 'uploads');
    if (fs.existsSync(storageDir)) {
      const files = fs.readdirSync(storageDir);
      for (const file of files) {
        if (file.startsWith('test_asset_')) {
          try {
            fs.unlinkSync(path.join(storageDir, file));
          } catch {}
        }
      }
    }
    await cleanDatabase();
    await closeDatabase();
  });

  // Scenario 1: Standard Collection Fetch (< 1s SLA)
  describe('Scenario 1: Standard Collection Fetch', () => {
    it('should load gallery of 100 assets in under 1 second (< 1000ms)', async () => {
      const startTime = Date.now();

      const res = await request(app)
        .get(`/api/assets?brandDnaId=${brandDnaId}&limit=100`)
        .set('Authorization', authHeader);

      const duration = Date.now() - startTime;
      console.log(`[GALLERY METRIC] Standard Collection Fetch Latency: ${duration}ms (100 assets)`);

      expect(res.status).toBe(200);
      expect(res.body.assets.length).toBe(100);
      expect(res.body.total).toBe(100);
      expect(duration).toBeLessThan(1000);
    });
  });

  // Scenario 2: Multi-Parameter Filter Search (SLA < 1000ms)
  describe('Scenario 2: Multi-Parameter Filter Search', () => {
    it('should search/filter assets with multiple parameters in under 1000ms', async () => {
      const startTime = Date.now();

      const res = await request(app)
        .get(`/api/assets?brandDnaId=${brandDnaId}&type=image&tag=hero&searchQuery=Launch`)
        .set('Authorization', authHeader);

      const duration = Date.now() - startTime;
      console.log(`[FILTER METRIC] Multi-Parameter Search Latency: ${duration}ms (${res.body.assets.length} matches)`);

      expect(res.status).toBe(200);
      expect(res.body.assets.length).toBeGreaterThan(0);
      for (const asset of res.body.assets) {
        expect(asset.brandDnaId).toBe(brandDnaId);
        expect(asset.type).toBe('image');
        expect(asset.tags).toContain('hero');
      }
      expect(duration).toBeLessThan(1000);
    });
  });

  // Scenario 3: Empty Index Matching
  describe('Scenario 3: Empty Index Matching', () => {
    it('should return clean 200 OK and empty array when search filters match no assets', async () => {
      const startTime = Date.now();

      const res = await request(app)
        .get('/api/assets?type=nonexistent_type&searchQuery=XYZ_NOT_FOUND_999')
        .set('Authorization', authHeader);

      const duration = Date.now() - startTime;
      console.log(`[EMPTY METRIC] Empty Search Latency: ${duration}ms`);

      expect(res.status).toBe(200);
      expect(res.body.assets).toEqual([]);
      expect(res.body.total).toBe(0);
      expect(duration).toBeLessThan(1000);
    });
  });

  // Scenario 4: Download Success Rate (100% target)
  describe('Scenario 4: High-Performance Binary File Streaming', () => {
    it('should stream binary asset content with 100% download success rate across test samples', async () => {
      const downloadSamples = sampleAssetIds.slice(0, 10);
      let successCount = 0;

      for (const id of downloadSamples) {
        const res = await request(app).get(`/api/assets/${id}/download`).set('Authorization', authHeader);
        if (res.status === 200 && res.headers['content-type'] === 'image/png') {
          successCount++;
        }
      }

      const successRate = (successCount / downloadSamples.length) * 100;
      console.log(`[STREAMING METRIC] Download Success Rate: ${successRate.toFixed(1)}% (${successCount}/${downloadSamples.length})`);

      expect(resStatusRate(successCount, downloadSamples.length)).toBe(100);
    });

    it('errors instead of silently fabricating placeholder content when the file is missing from disk', async () => {
      // No file is ever written for this path - simulates a row whose
      // backing file was deleted/lost (a wiped volume, a manual deletion,
      // a bug elsewhere). getAssetStream must surface that as a real
      // error, not serve fake placeholder bytes as if it were a genuine
      // successful download (see asset.service.ts).
      const missingFilePath = path.join(process.cwd(), 'uploads', `never_written_${Date.now()}.png`);
      const assetRes = await query(
        `INSERT INTO assets (brand_dna_id, campaign_id, name, type, file_path, mime_type, file_size, tags, meta_data, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [brandDnaId, campaignId, 'Missing file asset', 'image', missingFilePath, 'image/png', 100, [], {}, testUserId]
      );

      const res = await request(app).get(`/api/assets/${assetRes.rows[0].id}/download`).set('Authorization', authHeader);
      expect(res.status).not.toBe(200);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // Scenario 5: Editable Assets (PUT /api/assets/:id)
  describe('Scenario 5: Editable Assets', () => {
    // A minimal valid 1x1 red PNG, base64-encoded - avoids needing a real image file.
    const ONE_PX_PNG_DATA_URL =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    it('overwrites the asset file in place and merges metaData, keeping the same id', async () => {
      const id = sampleAssetIds[0];
      const before = await query('SELECT file_path, file_size FROM assets WHERE id = $1', [id]);

      const res = await request(app)
        .put(`/api/assets/${id}`)
        .set('Authorization', authHeader)
        .send({ imageDataUrl: ONE_PX_PNG_DATA_URL, metaData: { editorState: { textLayers: [{ text: 'Edited' }] } } });

      expect(res.status).toBe(200);
      expect(res.body.asset.id).toBe(id);
      expect(res.body.asset.mimeType).toBe('image/png');
      expect(res.body.asset.metaData.editorState.textLayers[0].text).toBe('Edited');

      const after = await query('SELECT file_path, file_size, meta_data FROM assets WHERE id = $1', [id]);
      expect(after.rows[0].file_path).toBe(before.rows[0].file_path); // same path/id, overwritten in place
      expect(after.rows[0].file_size).not.toBe(before.rows[0].file_size);

      const onDisk = fs.readFileSync(after.rows[0].file_path);
      expect(onDisk.length).toBe(after.rows[0].file_size);
    });

    it('returns 404 for an unknown asset id', async () => {
      const res = await request(app)
        .put('/api/assets/00000000-0000-0000-0000-000000000000')
        .set('Authorization', authHeader)
        .send({ imageDataUrl: ONE_PX_PNG_DATA_URL });
      expect(res.status).toBe(404);
    });

    it('rejects a malformed data URL with 400', async () => {
      const res = await request(app)
        .put(`/api/assets/${sampleAssetIds[0]}`)
        .set('Authorization', authHeader)
        .send({ imageDataUrl: 'not-a-data-url' });
      expect(res.status).toBe(400);
    });

    it('rejects an empty body with 400', async () => {
      const res = await request(app)
        .put(`/api/assets/${sampleAssetIds[0]}`)
        .set('Authorization', authHeader)
        .send({});
      expect(res.status).toBe(400);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).put(`/api/assets/${sampleAssetIds[0]}`).send({ imageDataUrl: ONE_PX_PNG_DATA_URL });
      expect(res.status).toBe(401);
    });
  });

  // Scenario 6: Re-editing a saved asset from the Asset Library
  // (GET /api/assets/:id/raw-background)
  describe('Scenario 6: Raw background retrieval for re-editing', () => {
    it('404s for an asset with no stored raw background (e.g. a plain photoshoot image)', async () => {
      const res = await request(app)
        .get(`/api/assets/${sampleAssetIds[0]}/raw-background`)
        .set('Authorization', authHeader);
      expect(res.status).toBe(404);
    });

    it('404s for an unknown asset id', async () => {
      const res = await request(app)
        .get('/api/assets/00000000-0000-0000-0000-000000000000/raw-background')
        .set('Authorization', authHeader);
      expect(res.status).toBe(404);
    });

    it('serves the stored raw background when a campaign-post/carousel asset has one', async () => {
      const storageDir = path.join(process.cwd(), 'uploads');
      const rawFileName = `test_asset_raw_bg_${Date.now()}.jpg`;
      const rawFilePath = path.join(storageDir, rawFileName);
      fs.writeFileSync(rawFilePath, Buffer.from('FAKE_RAW_BACKGROUND_BYTES'));

      const assetRes = await query(
        `INSERT INTO assets (brand_dna_id, campaign_id, name, type, file_path, mime_type, file_size, tags, meta_data, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          brandDnaId,
          campaignId,
          'Campaign post with raw background',
          'banner',
          rawFilePath, // flattened file_path is irrelevant here - only meta_data.rawBackgroundPath matters
          'image/jpeg',
          1024,
          ['campaign-post'],
          JSON.stringify({ headline: 'Test Headline', rawBackgroundPath: rawFilePath }),
          testUserId
        ]
      );
      const rawBgAssetId = assetRes.rows[0].id;

      const res = await request(app)
        .get(`/api/assets/${rawBgAssetId}/raw-background`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(Buffer.from(res.body).toString()).toBe('FAKE_RAW_BACKGROUND_BYTES');

      fs.unlinkSync(rawFilePath);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get(`/api/assets/${sampleAssetIds[0]}/raw-background`);
      expect(res.status).toBe(401);
    });
  });

  // Scenario 7: Ownership isolation - a different authenticated user must not
  // be able to see, edit, or download another user's assets, and the
  // /api/assets list must never leak assets across owners.
  describe('Scenario 7: Asset ownership isolation', () => {
    it('excludes another user\'s assets from the list endpoint entirely', async () => {
      const otherAuthHeader = await getTestAuthHeader('admin@brandcore.com', 'password123');

      const res = await request(app)
        .get('/api/assets?limit=200')
        .set('Authorization', otherAuthHeader);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
      expect(res.body.assets).toEqual([]);
    });

    it('returns 404 (not the asset) when a different user fetches, updates, or downloads someone else\'s asset', async () => {
      const otherAuthHeader = await getTestAuthHeader('admin@brandcore.com', 'password123');
      // Index 50, not 0 - Scenario 5 above already overwrites sampleAssetIds[0]'s
      // file in place, which would make the file_size assertion below flaky
      // depending on test execution order.
      const id = sampleAssetIds[50];

      const getRes = await request(app).get(`/api/assets/${id}`).set('Authorization', otherAuthHeader);
      expect(getRes.status).toBe(404);

      const downloadRes = await request(app).get(`/api/assets/${id}/download`).set('Authorization', otherAuthHeader);
      expect(downloadRes.status).toBe(404);

      const ONE_PX_PNG_DATA_URL =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
      const putRes = await request(app)
        .put(`/api/assets/${id}`)
        .set('Authorization', otherAuthHeader)
        .send({ imageDataUrl: ONE_PX_PNG_DATA_URL });
      expect(putRes.status).toBe(404);

      // Confirm the asset genuinely wasn't touched by the rejected PUT.
      const dbRes = await query('SELECT file_size FROM assets WHERE id = $1', [id]);
      expect(dbRes.rows[0].file_size).toBe(1024 + 50);
    });
  });
});

function resStatusRate(success: number, total: number): number {
  return (success / total) * 100;
}
