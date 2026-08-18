import request from 'supertest';
import http from 'http';
import app from '../src/app';
import { initializeDatabase, cleanDatabase, closeDatabase, query } from '../src/db';
import { getTestAuthSession } from './helpers/testAuth';

describe('Coordinator Agent (LangGraph) integration', () => {
  let server: http.Server;
  let authHeader: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();

    await new Promise<void>((resolve) => {
      server = http.createServer((req, res) => {
        if (req.url === '/happy') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>Coordinator Test Co</title></head>
              <body>
                <h1>Welcome to Coordinator Test Co</h1>
                <p>We build reliable coordination tooling for distributed teams.</p>
              </body>
            </html>
          `);
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });
      server.listen(4569, () => resolve());
    });
  }, 15000);

  beforeEach(async () => {
    await cleanDatabase();
    const session = await getTestAuthSession();
    authHeader = session.authHeader;
  });

  afterAll(async () => {
    await closeDatabase();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('runs a DNA-only scan (no prompt) and stops after Website/Vision/Brand Intelligence', async () => {
    const res = await request(app)
      .post('/api/coordinator/run')
      .set('Authorization', authHeader)
      .send({ url: 'http://localhost:4569/happy' });

    expect(res.status).toBe(200);
    expect(res.body.brandDnaId).toBeTruthy();
    expect(res.body.dna.title).toBe('Coordinator Test Co');
    expect(res.body.creative).toBeNull();

    const row = await query('SELECT id FROM crawl_results WHERE id = $1', [res.body.brandDnaId]);
    expect(row.rows).toHaveLength(1);
  }, 30000);

  it('runs scan + text creative generation in one coordinated call when a prompt is supplied', async () => {
    const res = await request(app)
      .post('/api/coordinator/run')
      .set('Authorization', authHeader)
      .send({ url: 'http://localhost:4569/happy', prompt: 'Announce our new coordination dashboard', channel: 'LinkedIn' });

    expect(res.status).toBe(200);
    expect(res.body.brandDnaId).toBeTruthy();
    expect(res.body.dna.title).toBe('Coordinator Test Co');
    expect(res.body.creative).not.toBeNull();
    expect(res.body.creative.copy.headline).toBeTruthy();
    expect(res.body.creative.campaignId).toBeTruthy();

    const campaignRow = await query('SELECT id FROM campaigns WHERE id = $1', [res.body.creative.campaignId]);
    expect(campaignRow.rows).toHaveLength(1);
  }, 60000);

  it('rejects a missing url with 400', async () => {
    const res = await request(app).post('/api/coordinator/run').set('Authorization', authHeader).send({});
    expect(res.status).toBe(400);
  });

  it('rejects an invalid generationType with 400', async () => {
    const res = await request(app)
      .post('/api/coordinator/run')
      .set('Authorization', authHeader)
      .send({ url: 'http://localhost:4569/happy', prompt: 'x', generationType: 'not-a-real-type' });
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).post('/api/coordinator/run').send({ url: 'http://localhost:4569/happy' });
    expect(res.status).toBe(401);
  });
});
