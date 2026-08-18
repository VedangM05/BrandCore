import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import IORedis from 'ioredis';
import * as dotenv from 'dotenv';

// This is `app.ts`'s very first import, evaluated before anything else in
// the import graph (e.g. auth.service.ts) has had a chance to call
// dotenv.config() - without this, process.env.REDIS_URL reads as
// undefined at module-load time below, silently locking this module into
// the in-memory fallback for its entire lifetime regardless of what's
// actually in .env. Same self-sufficiency pattern as embedding.service.ts.
dotenv.config();

/**
 * Redis-backed when REDIS_URL is configured, in-memory (express-rate-limit's
 * default store) otherwise. Previously always in-memory, reasoned as
 * "correct for a single process, one-line swap later" - now that this repo
 * actually runs real Redis for BullMQ (see queue.service.ts / HANDOFF.md
 * §15), that swap is made: request counts now survive a process restart and
 * would stay correct across more than one instance, which in-memory never
 * could. Falls back to in-memory automatically if REDIS_URL isn't set or the
 * connection fails, rather than hard-erroring - rate limiting degrading to
 * "less shared" is an acceptable trade, unlike auth/payment-style features
 * failing closed.
 */
const redisUrl = process.env.REDIS_URL;
let redisClient: IORedis | null = null;
if (redisUrl) {
  redisClient = new IORedis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: false });
  redisClient.on('error', (err) => {
    console.warn('[RateLimit] Redis connection error - requests continue to be limited via this store regardless; if Redis stays down, restart the app to fall back to in-memory:', err.message);
  });
}

function buildStore(prefix: string): RedisStore | undefined {
  if (!redisClient) return undefined; // express-rate-limit uses its in-memory default when store is undefined
  return new RedisStore({
    prefix,
    sendCommand: (...args: string[]) => (redisClient!.call as any)(...args),
  });
}

/**
 * Real requests are limited; test runs are not, to avoid the suite's many
 * rapid sequential requests to the same endpoints (e.g. dozens of
 * login/register calls across test files sharing one IP under supertest)
 * tripping the limiter - same test-mode bypass pattern already used by
 * quota.middleware.ts. A dedicated test can still exercise real limiting by
 * setting the `x-test-rate-limit: true` header.
 */
function skipInTestMode(req: any): boolean {
  if (process.env.NODE_ENV !== 'test') return false;
  return req.headers['x-test-rate-limit'] !== 'true';
}

/**
 * Strict limiter for credential-related endpoints (login, register, Google
 * sign-in, refresh, password reset request/confirm) - these are exactly the
 * routes a brute-force/credential-stuffing/spam attempt would hammer.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTestMode,
  store: buildStore('brandcore-rl-auth:'),
  message: { error: 'Too many attempts. Please try again in a few minutes.' },
});

/**
 * Looser, general-purpose limiter applied to all /api/* traffic as a
 * defensive backstop against runaway clients/scripts - generous enough to
 * never bother a real user in normal use.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTestMode,
  store: buildStore('brandcore-rl-api:'),
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
});
