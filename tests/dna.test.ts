import request from 'supertest';
import http from 'http';
import app from '../src/app';
import { initializeDatabase, cleanDatabase, closeDatabase, query } from '../src/db';
import { getTestAuthSession, getTestAuthHeader } from './helpers/testAuth';
import { domainCrawlLimiter } from '../src/services/domainRateLimiter.service';

describe('DNA Scanning API Integration Tests', () => {
  let server: http.Server;
  let authHeader: string;
  let testUserId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();

    // Start a local server to serve mock HTML pages for the crawl agent to crawl offline
    await new Promise<void>((resolve) => {
      server = http.createServer((req, res) => {
        if (req.url === '/happy') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>Happy Corporation</title>
                <link rel="icon" href="/logo.png">
              </head>
              <body>
                <h1>Welcome to Happy Corp</h1>
                <p>We are a professional business offering reliable corporate services.</p>
                <h2>Our Innovation</h2>
                <p>We build modern and innovative AI technology platform products.</p>
              </body>
            </html>
          `);
        } else if (req.url === '/no-images') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>Minimal Corp</title>
              </head>
              <body>
                <h1>No Images Here</h1>
                <p>Just text content to test image-less graceful parsing.</p>
              </body>
            </html>
          `);
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });
      server.listen(4567, () => resolve());
    });
  }, 15000); // Allow extra time for db initialization and server start

  beforeEach(async () => {
    await cleanDatabase();
    const session = await getTestAuthSession();
    authHeader = session.authHeader;
    testUserId = session.userId;
  });

  afterAll(async () => {
    await closeDatabase();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // Scenario 1: Happy Path
  it('Scenario 1 (Happy Path): should scan website, extract brand DNA, and populate db', async () => {
    const res = await request(app)
      .post('/api/dna/scan')
      .set('Authorization', authHeader)
      .send({ url: 'http://localhost:4567/happy' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBeTruthy();
    expect(res.body.title).toBe('Happy Corporation');
    expect(res.body.logo_url).toContain('/logo.png');
    expect(res.body.colors).toBeInstanceOf(Array);
    expect(res.body.colors.length).toBeGreaterThanOrEqual(4);
    // .toContain, not .toBe - font_pairings is real LLM-synthesized output
    // (see intelligence.service.ts) whenever GROQ_API_KEY is configured,
    // same as `tone` right below. A real Groq call can legitimately phrase
    // this as "Plus Jakarta Sans (Headers) & Inter (Body)" instead of the
    // crawl_agent.py default's exact "Plus Jakarta Sans & Inter" - an
    // exact-match assertion here was only ever passing because it was
    // silently exercising the local-fallback path (no working LLM
    // response), not because the real synthesis output was that literal
    // string. Found via this session's real end-to-end run once Groq
    // actually started succeeding (HANDOFF.md §22).
    expect(res.body.font_pairings).toContain('Plus Jakarta Sans');
    expect(res.body.font_pairings).toContain('Inter');
    // Case-insensitive too - real LLM prose capitalizes these
    // inconsistently ("innovative" mid-sentence vs "Innovative" as a
    // standalone descriptor), unlike the deterministic local fallback's
    // fixed-case default. A literal-case .toContain here hit the exact
    // same "only ever passed via the fallback path" trap font_pairings did
    // above.
    expect(res.body.tone.toLowerCase()).toContain('professional');
    expect(res.body.tone.toLowerCase()).toContain('innovative');
    expect(res.body.dom_hierarchy).toBeInstanceOf(Array);
    expect(res.body.dom_hierarchy.length).toBeGreaterThan(0);

    // Verify database entries
    const jobsRes = await query('SELECT * FROM crawl_jobs');
    expect(jobsRes.rows.length).toBe(1);
    expect(jobsRes.rows[0].status).toBe('completed');
    expect(jobsRes.rows[0].pages_crawled).toBe(1);

    const resultsRes = await query('SELECT * FROM crawl_results');
    expect(resultsRes.rows.length).toBe(1);
    expect(resultsRes.rows[0].title).toBe('Happy Corporation');
    expect(resultsRes.rows[0].logo_url).toContain('/logo.png');
    expect(resultsRes.rows[0].colors).toBeInstanceOf(Array);
    expect(resultsRes.rows[0].dom_hierarchy).toBeInstanceOf(Array);
  }, 25000); // 25 seconds timeout to allow Playwright execution

  // Scenario 2: Edge Case (Invalid URL)
  it('Scenario 2 (Edge Case): should reject scan requests with invalid or missing URL parameters', async () => {
    const badUrlRes = await request(app)
      .post('/api/dna/scan')
      .set('Authorization', authHeader)
      .send({ url: 'invalid-url' });

    expect(badUrlRes.status).toBe(400);
    expect(badUrlRes.body.error).toBe('Invalid URL format');

    const missingUrlRes = await request(app)
      .post('/api/dna/scan')
      .set('Authorization', authHeader)
      .send({});

    expect(missingUrlRes.status).toBe(400);
    expect(missingUrlRes.body.error).toBe('URL is required');

    // Verify no db job was created
    const jobsRes = await query('SELECT * FROM crawl_jobs');
    expect(jobsRes.rows.length).toBe(0);
  });

  // Scenario 3: Site with No Images
  it('Scenario 3 (No Images): should gracefully crawl image-less sites returning default colors and no logo', async () => {
    const res = await request(app)
      .post('/api/dna/scan')
      .set('Authorization', authHeader)
      .send({ url: 'http://localhost:4567/no-images' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.title).toBe('Minimal Corp');
    expect(res.body.logo_url).toContain('/favicon.ico'); // falls back to favicon
    expect(res.body.colors).toEqual(['#4f46e5', '#f97316', '#0ea5e9', '#10b981']); // fallback palette
    expect(res.body.dom_hierarchy).toBeInstanceOf(Array);
    expect(res.body.dom_hierarchy.length).toBeGreaterThan(0);

    // Verify database entries
    const jobsRes = await query('SELECT * FROM crawl_jobs');
    expect(jobsRes.rows.length).toBe(1);
    expect(jobsRes.rows[0].status).toBe('completed');
  }, 25000);

  // Scenario 4: Editable Business DNA (PATCH /api/dna/:id) - letting a user
  // correct the auto-extraction, since it doesn't always get everything right.
  describe('Scenario 4: Editable Business DNA', () => {
    let brandDnaId: string;

    beforeEach(async () => {
      const dnaRes = await query(
        `INSERT INTO crawl_results (domain, url, title, tagline, tone, colors, font_pairings, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        ['example.com', 'https://example.com', 'Auto Corp', 'Auto tagline', 'Auto tone', ['#111111', '#222222'], 'Auto Sans', testUserId]
      );
      brandDnaId = dnaRes.rows[0].id;
    });

    it('applies a correction to colors, tone, font, name, and tagline', async () => {
      const res = await request(app)
        .patch(`/api/dna/${brandDnaId}`)
        .set('Authorization', authHeader)
        .send({
          title: 'Corrected Corp',
          tagline: 'Corrected tagline',
          tone: 'Corrected tone',
          font_pairings: 'Corrected Sans',
          colors: ['#1F3B33', '#FBFAF7'],
        });

      expect(res.status).toBe(200);
      expect(res.body.brandDna.title).toBe('Corrected Corp');
      expect(res.body.brandDna.tagline).toBe('Corrected tagline');
      expect(res.body.brandDna.tone).toBe('Corrected tone');
      expect(res.body.brandDna.font_pairings).toBe('Corrected Sans');
      expect(res.body.brandDna.colors).toEqual(['#1F3B33', '#FBFAF7']);

      const dbRes = await query('SELECT title, colors FROM crawl_results WHERE id = $1', [brandDnaId]);
      expect(dbRes.rows[0].title).toBe('Corrected Corp');
      expect(dbRes.rows[0].colors).toEqual(['#1F3B33', '#FBFAF7']);
    });

    it('rejects a non-hex color with 400 and leaves the row unchanged', async () => {
      const res = await request(app)
        .patch(`/api/dna/${brandDnaId}`)
        .set('Authorization', authHeader)
        .send({ colors: ['not-a-color'] });

      expect(res.status).toBe(400);

      const dbRes = await query('SELECT colors FROM crawl_results WHERE id = $1', [brandDnaId]);
      expect(dbRes.rows[0].colors).toEqual(['#111111', '#222222']);
    });

    it('returns 404 for an unknown brand DNA id', async () => {
      const res = await request(app)
        .patch('/api/dna/00000000-0000-0000-0000-000000000000')
        .set('Authorization', authHeader)
        .send({ title: 'Whatever' });

      expect(res.status).toBe(404);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).patch(`/api/dna/${brandDnaId}`).send({ title: 'Whatever' });
      expect(res.status).toBe(401);
    });

    it('returns 404 (not 403) when a different user tries to edit someone else\'s brand DNA, and leaves it unchanged', async () => {
      const otherUserAuthHeader = await getTestAuthHeader('admin@brandcore.com', 'password123');

      const res = await request(app)
        .patch(`/api/dna/${brandDnaId}`)
        .set('Authorization', otherUserAuthHeader)
        .send({ title: 'Hijacked Corp' });

      expect(res.status).toBe(404);

      const dbRes = await query('SELECT title FROM crawl_results WHERE id = $1', [brandDnaId]);
      expect(dbRes.rows[0].title).toBe('Auto Corp');
    });
  });

  // Server-side projects, synced from every scan (see project.service.ts /
  // dna.service.ts) - closes the multi-tenancy gap where "projects" only
  // ever lived in frontend localStorage.
  describe('Project sync on scan', () => {
    it('creates a listable project linked to the scanned Brand DNA', async () => {
      const scanRes = await request(app)
        .post('/api/dna/scan')
        .set('Authorization', authHeader)
        .send({ url: 'http://localhost:4567/happy' });
      expect(scanRes.status).toBe(200);

      const projectsRes = await request(app).get('/api/projects').set('Authorization', authHeader);
      expect(projectsRes.status).toBe(200);
      expect(projectsRes.body.projects).toHaveLength(1);
      expect(projectsRes.body.projects[0].id).toBe(scanRes.body.id); // Brand DNA id, not a synthetic id
      expect(projectsRes.body.projects[0].name).toBe('Happy Corporation');
      expect(projectsRes.body.projects[0].url).toBe('http://localhost:4567/happy');
    });

    it('rescanning the same URL updates the same project instead of creating a duplicate', async () => {
      const firstScan = await request(app)
        .post('/api/dna/scan')
        .set('Authorization', authHeader)
        .send({ url: 'http://localhost:4567/happy' });

      const secondScan = await request(app)
        .post('/api/dna/scan')
        .set('Authorization', authHeader)
        .send({ url: 'http://localhost:4567/happy' });

      expect(firstScan.body.id).toBe(secondScan.body.id); // same crawl_results row, upserted

      const projectsRes = await request(app).get('/api/projects').set('Authorization', authHeader);
      expect(projectsRes.body.projects).toHaveLength(1);
    });
  });

  // Per-domain crawl concurrency cap (spec Fix #6) - see
  // domainRateLimiter.service.ts. Real concurrency behavior is exercised in
  // tests/domainRateLimiter.test.ts in isolation; this confirms runDnaScan
  // actually acquires/releases a slot for the scanned domain, and that a
  // failed crawl still releases it (no permanently stuck slot).
  describe('Per-domain crawl concurrency cap wiring', () => {
    afterEach(() => {
      domainCrawlLimiter.reset();
    });

    it('acquires and releases a concurrency slot for the scanned domain', async () => {
      const acquireSpy = jest.spyOn(domainCrawlLimiter, 'acquire');

      const res = await request(app)
        .post('/api/dna/scan')
        .set('Authorization', authHeader)
        .send({ url: 'http://localhost:4567/happy' });

      expect(res.status).toBe(200);
      expect(acquireSpy).toHaveBeenCalledWith('localhost');
      expect(domainCrawlLimiter.getInFlightCount('localhost')).toBe(0); // released after completion

      acquireSpy.mockRestore();
    });

    // Note: a "release on failure" test was deliberately not added here -
    // crawl4ai and intelligence.service.ts both degrade gracefully (fallback
    // heuristics) rather than throwing on a bad/unreachable URL in this
    // codebase, so there's no reliable way to force runDnaScan's catch path
    // through the real HTTP layer without introducing new mocking
    // infrastructure. The release itself is a plain try/finally wrapping the
    // whole spawn block in dna.service.ts, and the underlying slot
    // acquire/release/queue logic is exhaustively covered in isolation by
    // tests/domainRateLimiter.test.ts.
  });
});
