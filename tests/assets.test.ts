import request from 'supertest';
import app from '../src/app';
import { initializeDatabase, closeDatabase, cleanDatabase, query } from '../src/db';
import { registerInMemoryAssetFile, clearInMemoryAssetFiles } from '../src/services/asset.service';

describe('Asset Library & History Module Integration Tests', () => {
  let brandDnaId: string;
  let sampleAssetIds: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
    clearInMemoryAssetFiles();
    sampleAssetIds = [];

    // Seed mock Brand DNA record
    const dnaRes = await query(
      `INSERT INTO crawl_results 
      (domain, url, title, meta_description, markdown_content, logo_url, colors, font_pairings, tone, dom_hierarchy, tagline, mission, audience, value_proposition)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [
        'assetbrand.com',
        'http://assetbrand.com',
        'Asset Brand Co',
        'High quality creative assets library',
        '# Asset Brand',
        'http://assetbrand.com/logo.png',
        ['#4f46e5', '#f97316'],
        'Outfit & Inter',
        'Modern & Professional',
        JSON.stringify([]),
        'Assets done right.',
        'To empower design workflows.',
        'Designers and Marketers.',
        'Instant brand asset access.'
      ]
    );
    brandDnaId = dnaRes.rows[0].id;

    // Seed 100 sample assets into PostgreSQL using a single multi-row insert batch query
    const types = ['image', 'copy', 'logo', 'banner'];
    const tagSets = [
      ['hero', 'modern', 'spring'],
      ['social', 'minimal', 'promo'],
      ['brand', 'vector', 'logo'],
      ['campaign', 'headline', 'banner']
    ];

    const valueRows: string[] = [];
    const params: any[] = [brandDnaId];

    for (let i = 1; i <= 100; i++) {
      const type = types[i % types.length];
      const tags = tagSets[i % tagSets.length];
      const filePath = `/storage/assets/asset_${i}.${type === 'image' || type === 'banner' || type === 'logo' ? 'png' : 'txt'}`;
      const name = `Creative Asset ${i} - ${type.toUpperCase()} Banner Launch`;
      const mimeType = type === 'copy' ? 'text/plain' : 'image/png';
      const fileSize = 1024 * (i % 10 + 1);

      // Register mock file content in stream registry
      const contentBuffer = Buffer.from(`Binary file content payload for Asset #${i} (${name})`, 'utf-8');
      registerInMemoryAssetFile(filePath, contentBuffer);

      params.push(name, type, filePath, mimeType, fileSize, tags, JSON.stringify({ index: i, category: type, resolution: '1920x1080' }));
      const baseIdx = (i - 1) * 7 + 2;
      valueRows.push(`($1, $${baseIdx}, $${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, $${baseIdx + 5}, $${baseIdx + 6})`);
    }

    const batchInsertSql = `
      INSERT INTO assets 
      (brand_dna_id, name, type, file_path, mime_type, file_size, tags, meta_data)
      VALUES ${valueRows.join(', ')}
      RETURNING id
    `;

    const batchRes = await query(batchInsertSql, params);
    sampleAssetIds = batchRes.rows.map((row: any) => row.id);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  // Scenario 1: Standard Collection Fetch (100 assets, SLA < 1s)
  describe('Scenario 1: Standard Collection Fetch', () => {
    it('should load gallery of 100 assets in under 1 second (< 1000ms)', async () => {
      const startTime = Date.now();

      const res = await request(app)
        .get('/api/assets?limit=100');

      const duration = Date.now() - startTime;
      console.log(`[GALLERY METRIC] Standard Collection Fetch Latency: ${duration}ms (100 assets)`);

      expect(res.status).toBe(200);
      expect(res.body.assets.length).toBe(100);
      expect(res.body.total).toBe(100);
      expect(duration).toBeLessThan(1000);
    });
  });

  // Scenario 2: Multi-Parameter Filter Search (SLA < 300ms)
  describe('Scenario 2: Multi-Parameter Filter Search', () => {
    it('should search/filter assets with multiple parameters in under 300ms', async () => {
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
      expect(duration).toBeLessThan(300);
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
      expect(duration).toBeLessThan(300);
    });
  });

  // Scenario 4: Download Success Rate (100% target)
  describe('Scenario 4: High-Performance Binary File Streaming', () => {
    it('should stream binary asset content with 100% download success rate across test samples', async () => {
      const downloadSamples = sampleAssetIds.slice(0, 10);
      let successCount = 0;

      for (const id of downloadSamples) {
        const res = await request(app)
          .get(`/api/assets/${id}/download`)
          .responseType('blob');

        if (res.status === 200 && res.headers['content-type'] && res.headers['content-disposition']) {
          successCount++;
        }
      }

      const successRate = (successCount / downloadSamples.length) * 100;
      console.log(`[STREAMING METRIC] Download Success Rate: ${successRate.toFixed(1)}% (${successCount}/${downloadSamples.length})`);
      expect(successRate).toBe(100.0);
    });
  });
});
