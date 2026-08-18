import { initializeDatabase, cleanDatabase, closeDatabase, query } from '../src/db';
import { getTestAuthSession } from './helpers/testAuth';
import { indexBrandKnowledge, enqueueKnowledgeIndexing } from '../src/services/knowledgeBase.service';
import { qdrantService } from '../src/services/qdrant.service';
import { defaultQueueManager } from '../src/services/queue.service';

describe('knowledgeBase.service', () => {
  let testUserId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
    const session = await getTestAuthSession();
    testUserId = session.userId;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  async function insertBrandDna(markdown: string, overrides: Partial<Record<string, any>> = {}): Promise<string> {
    const res = await query(
      `INSERT INTO crawl_results
      (domain, url, title, markdown_content, tagline, mission, audience, value_proposition, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        'knowledgetest.com',
        'https://knowledgetest.com',
        overrides.title ?? 'Knowledge Test Co',
        markdown,
        overrides.tagline ?? 'Testing knowledge, one chunk at a time.',
        overrides.mission ?? 'To make indexing reliable.',
        overrides.audience ?? 'QA engineers',
        overrides.valueProposition ?? 'Reliable retrieval-augmented answers.',
        testUserId,
      ]
    );
    return res.rows[0].id;
  }

  it('indexes markdown content into Qdrant, chunked and retrievable', async () => {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('[knowledgeBase.test] Skipping - no GEMINI_API_KEY configured');
      return;
    }

    const brandDnaId = await insertBrandDna(
      'We manufacture eco-friendly bamboo toothbrushes.\n\nOur factory runs on 100% solar power and ships plastic-free packaging worldwide.'
    );

    const result = await indexBrandKnowledge(brandDnaId);
    expect(result.chunksIndexed).toBeGreaterThan(0);

    const found = await qdrantService.searchKnowledge(brandDnaId, 'what does this company manufacture?', undefined, 5);
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((r) => r.text.toLowerCase().includes('bamboo toothbrushes'))).toBe(true);
  }, 30000);

  it('also indexes the synthesized brand summary as a high-signal brand_memory chunk', async () => {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('[knowledgeBase.test] Skipping - no GEMINI_API_KEY configured');
      return;
    }

    const brandDnaId = await insertBrandDna('Some raw crawled markdown content about the site.', {
      mission: 'To eliminate single-use plastic from oral care forever.',
    });

    await indexBrandKnowledge(brandDnaId);

    const memoryResults = await qdrantService.searchKnowledge(brandDnaId, 'mission statement', 'brand_memory', 5);
    expect(memoryResults.length).toBeGreaterThan(0);
    expect(memoryResults[0].text).toContain('single-use plastic');
  }, 30000);

  it('re-indexing (rescan) replaces prior chunks instead of accumulating duplicates', async () => {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('[knowledgeBase.test] Skipping - no GEMINI_API_KEY configured');
      return;
    }

    const brandDnaId = await insertBrandDna('Original content about widgets.');
    await indexBrandKnowledge(brandDnaId);

    await query('UPDATE crawl_results SET markdown_content = $1 WHERE id = $2', ['Completely different content about gadgets.', brandDnaId]);
    await indexBrandKnowledge(brandDnaId);

    const widgetResults = await qdrantService.searchKnowledge(brandDnaId, 'widgets', undefined, 10);
    expect(widgetResults.some((r) => r.text.includes('widgets'))).toBe(false);

    const gadgetResults = await qdrantService.searchKnowledge(brandDnaId, 'gadgets', undefined, 10);
    expect(gadgetResults.some((r) => r.text.includes('gadgets'))).toBe(true);
  }, 40000);

  it('returns zero chunks for a nonexistent brand DNA id rather than throwing', async () => {
    const result = await indexBrandKnowledge('00000000-0000-0000-0000-000000000000');
    expect(result.chunksIndexed).toBe(0);
  });

  it('enqueueKnowledgeIndexing runs the job end-to-end through the real queue', async () => {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('[knowledgeBase.test] Skipping - no GEMINI_API_KEY configured');
      return;
    }

    const brandDnaId = await insertBrandDna('Queue-driven indexing test content about telescopes.');
    const jobId = await enqueueKnowledgeIndexing(brandDnaId);
    // 30s (was 20s) - a touch more margin; this timed out once during a
    // ~20-minute full-suite run (dozens of real Redis/BullMQ connections
    // cycling across every test file) despite completing in ~2s both in
    // isolation and alongside coordinator.test.ts/observability.test.ts
    // (the files most likely to interact with the same shared queue) - read
    // as sustained-load flakiness, not a reproducible logic bug.
    await defaultQueueManager.waitForCompletion(jobId, 30000);

    const results = await qdrantService.searchKnowledge(brandDnaId, 'telescopes', undefined, 5);
    expect(results.length).toBeGreaterThan(0);
  }, 40000);
});
