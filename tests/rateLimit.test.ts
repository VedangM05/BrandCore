import request from 'supertest';
import IORedis from 'ioredis';
import app from '../src/app';
import { initializeDatabase, cleanDatabase, closeDatabase } from '../src/db';

describe('Rate limiting', () => {
  // Unlike the old in-memory store, a Redis-backed limiter's counters
  // survive across separate test runs/processes (same key, same Redis) -
  // clear this file's own keys first so each run starts from a clean
  // window instead of inheriting leftover counts from a previous run.
  let redisClient: IORedis | null = null;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();

    if (process.env.REDIS_URL) {
      redisClient = new IORedis(process.env.REDIS_URL);
      const keys = await redisClient.keys('brandcore-rl-auth:*');
      if (keys.length > 0) await redisClient.del(...keys);
    }
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
    await redisClient?.quit();
  });

  it('does not rate-limit normal requests during tests (no x-test-rate-limit header)', async () => {
    // 25 requests > the real 20/15min auth limit - would 429 if the test-mode
    // bypass weren't working, exactly like the rest of this suite's many
    // sequential login/register calls would without it.
    for (let i = 0; i < 25; i++) {
      const res = await request(app).post('/api/auth/login').send({ email: 'nope@example.com', password: 'wrong' });
      expect(res.status).not.toBe(429);
    }
  }, 20000);

  it('enforces the strict limit on auth endpoints when explicitly opted in', async () => {
    let sawLimited = false;
    for (let i = 0; i < 25; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .set('x-test-rate-limit', 'true')
        .send({ email: 'nope@example.com', password: 'wrong' });
      if (res.status === 429) {
        sawLimited = true;
        expect(res.body.error).toContain('Too many attempts');
        break;
      }
    }
    expect(sawLimited).toBe(true);
  }, 20000);

  it('sets standard rate-limit response headers', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('x-test-rate-limit', 'true')
      .send({ email: 'nope@example.com', password: 'wrong' });
    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBeDefined();
  });

  it('applies helmet security headers', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('is genuinely Redis-backed when REDIS_URL is configured, not silently falling back to in-memory', async () => {
    if (!process.env.REDIS_URL || !redisClient) {
      console.warn('[rateLimit.test] Skipping - no REDIS_URL configured');
      return;
    }
    await request(app).post('/api/auth/login').set('x-test-rate-limit', 'true').send({ email: 'redis-check@example.com', password: 'wrong' });

    const keys = await redisClient.keys('brandcore-rl-auth:*');
    expect(keys.length).toBeGreaterThan(0);
  });
});
