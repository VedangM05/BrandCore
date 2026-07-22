import request from 'supertest';
import app from '../src/app';
import { initializeDatabase, cleanDatabase, closeDatabase, query } from '../src/db';
import fs from 'fs';
import path from 'path';

describe('Asset Library & History Module Integration Tests', () => {
  let brandDnaId: string;
  let campaignId: string;
  const sampleAssetIds: string[] = [];

  beforeAll(async () => {
    await initializeDatabase();
    await cleanDatabase();

    // 1. Seed brand DNA record
    const dnaRes = await query(
      `INSERT INTO crawl_results (domain, url, title, colors, tone)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['example.com', 'https://example.com', 'Example Brand', ['#000000', '#ffffff'], 'Modern']
    );
    brandDnaId = dnaRes.rows[0].id;

    // 2. Seed campaign record
    const campaignRes = await query(
      `INSERT INTO campaigns (brand_dna_id, prompt, headline)
       VALUES ($1, $2, $3) RETURNING id`,
      [brandDnaId, 'Summer Campaign', 'Summer Product Launch']
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
        `INSERT INTO assets (brand_dna_id, campaign_id, name, type, file_path, mime_type, file_size, tags, meta_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          brandDnaId,
          campaignId,
          `Asset ${i} - ${isHero ? 'Hero Banner Launch' : 'Standard Component'}`,
          isBanner ? 'image' : 'document',
          filePath,
          'image/png',
          1024 + i,
          tags,
          JSON.stringify({ width: 1920, height: 1080 })
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
        .get(`/api/assets?brandDnaId=${brandDnaId}&limit=100`);

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
        .get(`/api/assets?brandDnaId=${brandDnaId}&type=image&tag=hero&searchQuery=Launch`);

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
        .get('/api/assets?type=nonexistent_type&searchQuery=XYZ_NOT_FOUND_999');

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
        const res = await request(app).get(`/api/assets/${id}/download`);
        if (res.status === 200 && res.headers['content-type'] === 'image/png') {
          successCount++;
        }
      }

      const successRate = (successCount / downloadSamples.length) * 100;
      console.log(`[STREAMING METRIC] Download Success Rate: ${successRate.toFixed(1)}% (${successCount}/${downloadSamples.length})`);

      expect(resStatusRate(successCount, downloadSamples.length)).toBe(100);
    });
  });
});

function resStatusRate(success: number, total: number): number {
  return (success / total) * 100;
}
