import request from 'supertest';
import app from '../src/app';
import { initializeDatabase, cleanDatabase, closeDatabase } from '../src/db';
import { getTestAuthHeader, getTestAuthSession } from './helpers/testAuth';

describe('requireAuth middleware enforcement', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  const protectedRoutes: Array<{ method: 'get' | 'post'; path: string }> = [
    { method: 'post', path: '/api/dna/scan' },
    { method: 'post', path: '/api/creative/generate' },
    { method: 'post', path: '/api/cache/check' },
    { method: 'post', path: '/api/cache/store' },
    { method: 'get', path: '/api/usage/stats' },
    { method: 'post', path: '/api/usage/reset' },
    { method: 'post', path: '/api/usage/tier' },
    { method: 'get', path: '/api/assets' },
    { method: 'post', path: '/api/assets' },
    { method: 'get', path: '/api/observability/dashboard' },
    { method: 'post', path: '/api/observability/test-failure' }
  ];

  it.each(protectedRoutes)('rejects unauthenticated $method $path with 401', async ({ method, path }) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  it('rejects requests with a malformed/garbage bearer token', async () => {
    const res = await request(app)
      .get('/api/usage/stats')
      .set('Authorization', 'Bearer not-a-real-token')
      .send();
    expect(res.status).toBe(401);
  });

  it('allows requests carrying a valid access token through the auth gate', async () => {
    const authHeader = await getTestAuthHeader();
    const res = await request(app)
      .get('/api/usage/stats')
      .set('Authorization', authHeader);
    expect(res.status).toBe(200);
  });

  it('leaves /metrics and /health public (no auth required)', async () => {
    const metricsRes = await request(app).get('/metrics');
    expect(metricsRes.status).toBe(200);

    const healthRes = await request(app).get('/health');
    expect(healthRes.status).toBe(200);
  });

  it('rejects a non-admin authenticated user with 403, not 401', async () => {
    // demo@brandcore.com is seeded with role 'user' (see auth.service.ts's seedDefaultUsers).
    const session = await getTestAuthSession('demo@brandcore.com', 'password123');
    const res = await request(app)
      .post('/api/observability/test-failure')
      .set('Authorization', session.authHeader)
      .send({});
    expect(res.status).toBe(403);
  });

  it('allows an admin-role user through', async () => {
    // vedang@brandcore.com is seeded with role 'admin'.
    const session = await getTestAuthSession('vedang@brandcore.com', 'password123');
    const res = await request(app)
      .post('/api/observability/test-failure')
      .set('Authorization', session.authHeader)
      .send({});
    expect(res.status).toBe(200);
  });

  it('never trusts a client-supplied role - a forged JWT claim would need a valid signature, which a plain body field can\'t provide', async () => {
    // Sanity check on the mechanism itself: role comes from the verified
    // JWT payload (requireAuth), not from anything in the request body.
    const session = await getTestAuthSession('demo@brandcore.com', 'password123');
    const res = await request(app)
      .post('/api/observability/test-failure')
      .set('Authorization', session.authHeader)
      .send({ role: 'admin' }); // attempted spoof via body - must be ignored
    expect(res.status).toBe(403);
  });
});
// (requireRole tests live inside the describe block above - see the four
// tests before it - to share this file's single beforeAll/afterAll
// initializeDatabase/closeDatabase lifecycle. A second top-level describe
// with its own copy of that lifecycle would call closeDatabase() on the
// shared `pool` singleton (src/db/index.ts) before this block's own
// beforeAll could initializeDatabase() again on it - "Cannot use a pool
// after calling end on the pool".
