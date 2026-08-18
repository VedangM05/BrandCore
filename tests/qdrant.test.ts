import * as crypto from 'crypto';
import { qdrantService } from '../src/services/qdrant.service';

// These exercise the real local Qdrant container (see .env's QDRANT_URL /
// .env.example for how to start one) - there's no meaningful way to fake
// vector search semantics well enough to trust the results, so unlike some
// other services in this codebase, this suite doesn't attempt an
// in-memory-only test mode. If QDRANT_URL is unreachable, these fall back
// to the service's own in-memory substring-match mode (see
// qdrant.service.ts) rather than failing outright, but the real path is
// what's actually being verified.
describe('qdrant.service', () => {
  const projectA = `test-project-a-${crypto.randomUUID()}`;
  const projectB = `test-project-b-${crypto.randomUUID()}`;

  afterAll(async () => {
    await qdrantService.deleteProjectDocuments(projectA);
    await qdrantService.deleteProjectDocuments(projectB);
  });

  it('upserts and retrieves a document by semantic search, ranking the more relevant one higher', async () => {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('[qdrant.test] Skipping semantic ranking assertion - no GEMINI_API_KEY configured');
      return;
    }

    await qdrantService.upsertDocument({
      id: crypto.randomUUID(),
      projectId: projectA,
      type: 'website_page',
      text: 'We sell handmade ceramic mugs and pottery, crafted by local artisans.',
    });
    await qdrantService.upsertDocument({
      id: crypto.randomUUID(),
      projectId: projectA,
      type: 'website_page',
      text: 'Our office is located in downtown Seattle, open Monday through Friday.',
    });

    const results = await qdrantService.searchKnowledge(projectA, 'what products does this business sell?', undefined, 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].text).toContain('ceramic mugs');
  }, 20000);

  it('scopes results per project - a search in one project never returns another project\'s documents', async () => {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('[qdrant.test] Skipping - no GEMINI_API_KEY configured');
      return;
    }

    await qdrantService.upsertDocument({
      id: crypto.randomUUID(),
      projectId: projectB,
      type: 'website_page',
      text: 'This is a completely unrelated business selling industrial machine parts.',
    });

    const resultsA = await qdrantService.searchKnowledge(projectA, 'industrial machine parts', undefined, 10);
    for (const r of resultsA) {
      expect(r.projectId).toBe(projectA);
    }
  }, 20000);

  it('filters by type when a typeFilter is supplied', async () => {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('[qdrant.test] Skipping - no GEMINI_API_KEY configured');
      return;
    }

    const memoryDocId = crypto.randomUUID();
    await qdrantService.upsertDocument({
      id: memoryDocId,
      projectId: projectA,
      type: 'brand_memory',
      text: 'Brand mission: bringing artisanal pottery to every home.',
    });

    const results = await qdrantService.searchKnowledge(projectA, 'mission', 'brand_memory', 5);
    for (const r of results) {
      expect(r.type).toBe('brand_memory');
    }
  }, 20000);

  it('deleteProjectDocuments removes all points for that project only', async () => {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('[qdrant.test] Skipping - no GEMINI_API_KEY configured');
      return;
    }

    const scratchProject = `test-scratch-${crypto.randomUUID()}`;
    await qdrantService.upsertDocument({
      id: crypto.randomUUID(),
      projectId: scratchProject,
      type: 'website_page',
      text: 'Scratch project content to be deleted.',
    });

    let results = await qdrantService.searchKnowledge(scratchProject, 'scratch project content', undefined, 5);
    expect(results.length).toBeGreaterThan(0);

    await qdrantService.deleteProjectDocuments(scratchProject);

    results = await qdrantService.searchKnowledge(scratchProject, 'scratch project content', undefined, 5);
    expect(results).toHaveLength(0);
  }, 20000);

  it('returns an empty array (not an error) for a project with no indexed documents', async () => {
    const results = await qdrantService.searchKnowledge(`nonexistent-project-${crypto.randomUUID()}`, 'anything', undefined, 5);
    expect(results).toEqual([]);
  });
});
