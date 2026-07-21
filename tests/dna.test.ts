import request from 'supertest';
import http from 'http';
import app from '../src/app';
import { initializeDatabase, cleanDatabase, closeDatabase, query } from '../src/db';

describe('DNA Scanning API Integration Tests', () => {
  let server: http.Server;

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
      .send({ url: 'http://localhost:4567/happy' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.title).toBe('Happy Corporation');
    expect(res.body.logo_url).toContain('/logo.png');
    expect(res.body.colors).toBeInstanceOf(Array);
    expect(res.body.colors.length).toBeGreaterThanOrEqual(4);
    expect(res.body.font_pairings).toBe('Plus Jakarta Sans & Inter');
    expect(res.body.tone).toContain('Professional');
    expect(res.body.tone).toContain('Innovative');
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
      .send({ url: 'invalid-url' });

    expect(badUrlRes.status).toBe(400);
    expect(badUrlRes.body.error).toBe('Invalid URL format');

    const missingUrlRes = await request(app)
      .post('/api/dna/scan')
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
});
