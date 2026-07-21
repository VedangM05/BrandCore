import request from 'supertest';
import http from 'http';
import app from '../src/app';
import { initializeDatabase, cleanDatabase, closeDatabase, query } from '../src/db';
import { BrandDnaSchema } from '../src/services/intelligence.service';

describe('Brand DNA Intelligence API Integration Tests', () => {
  let server: http.Server;
  const latencies: number[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();

    // Start local server to host the 5 test sites
    await new Promise<void>((resolve) => {
      server = http.createServer((req, res) => {
        if (req.url === '/happy-corp') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>Happy Corp | Dynamic Enterprise Solutions</title>
                <link rel="icon" href="/logo.png">
              </head>
              <body>
                <h1>Welcome to Happy Corp</h1>
                <p>We are a professional business offering secure, reliable corporate database scaling services worldwide.</p>
                <h2>Our Mission</h2>
                <p>Empowering traditional enterprises with modern visual data frameworks.</p>
              </body>
            </html>
          `);
        } else if (req.url === '/tech-start') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>TechStart - Developer Automation platform</title>
                <link rel="shortcut icon" href="/brand-assets/favicon.ico">
              </head>
              <body>
                <h1>Automate Your Workflow</h1>
                <p>Innovative, next-gen software platform utilizing smart workflows and developer tools.</p>
              </body>
            </html>
          `);
        } else if (req.url === '/creative-studio') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>Studio X | Creative Design Agency</title>
              </head>
              <body>
                <h1>Studio X</h1>
                <p>We are a creative passion project studio designing unique art installations and brand identities.</p>
              </body>
            </html>
          `);
        } else if (req.url === '/no-images') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>Minimalist Solutions</title>
              </head>
              <body>
                <h1>Plain Text Site</h1>
                <p>No graphics. No images. No logo icons. Just simple semantic content.</p>
              </body>
            </html>
          `);
        } else if (req.url === '/malformed-data') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body>
                <p></p>
                <div></div>
              </body>
            </html>
          `);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
      });
      server.listen(4568, () => resolve());
    });
  }, 15000);

  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    // Output Latency report for quantitative metrics check
    const sorted = [...latencies].sort((a, b) => a - b);
    const p95Idx = Math.floor(sorted.length * 0.95);
    const p95 = sorted[p95Idx] || 0;
    console.log(`[LATENCY REPORT] p95 latency: ${p95.toFixed(2)}ms across ${latencies.length} calls`);
  });

  const testUrls = [
    { url: 'http://localhost:4568/happy-corp', name: 'Happy Corp' },
    { url: 'http://localhost:4568/tech-start', name: 'TechStart' },
    { url: 'http://localhost:4568/creative-studio', name: 'Studio X' },
    { url: 'http://localhost:4568/no-images', name: 'Minimalist' },
    { url: 'http://localhost:4568/malformed-data', name: 'Malformed' }
  ];

  testUrls.forEach(({ url, name }) => {
    it(`should successfully scan and synthesize Brand DNA for: ${name}`, async () => {
      const startTime = Date.now();
      const res = await request(app)
        .post('/api/dna/scan')
        .send({ url });
      
      const duration = Date.now() - startTime;
      latencies.push(duration);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Map the express API response properties back to the BrandDnaSchema properties for Zod validation
      const brandDnaToValidate = {
        brandName: res.body.title,
        tagline: res.body.tagline,
        colors: res.body.colors,
        fontPairing: res.body.font_pairings,
        tone: res.body.tone,
        mission: res.body.mission,
        audience: res.body.audience,
        valueProposition: res.body.value_proposition
      };

      // 1. Rigorous Zod Schema Validation check (100% conforming)
      const parseResult = BrandDnaSchema.safeParse(brandDnaToValidate);
      expect(parseResult.success).toBe(true);

      if (parseResult.success) {
        const dna = parseResult.data;
        expect(dna.brandName).toBeTruthy();
        expect(dna.tagline).toBeTruthy();
        expect(dna.colors).toBeInstanceOf(Array);
        expect(dna.colors.length).toBeGreaterThanOrEqual(2);
        expect(dna.fontPairing).toBeTruthy();
        expect(dna.tone).toBeTruthy();
        expect(dna.mission).toBeTruthy();
        expect(dna.audience).toBeTruthy();
        expect(dna.valueProposition).toBeTruthy();
      }

      // 2. Validate DB storage
      const resultsRes = await query('SELECT * FROM crawl_results WHERE url = $1', [url]);
      expect(resultsRes.rows.length).toBe(1);
      
      const row = resultsRes.rows[0];
      expect(row.tagline).toBeTruthy();
      expect(row.mission).toBeTruthy();
      expect(row.audience).toBeTruthy();
      expect(row.value_proposition).toBeTruthy();
      
    }, 25000);
  });
});
