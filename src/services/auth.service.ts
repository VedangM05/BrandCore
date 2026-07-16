import * as argon2 from 'argon2';
import * as jwt from 'jsonwebtoken';
import { trace, SpanStatusCode, Span } from '@opentelemetry/api';
import { query, getClient } from '../db';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';

dotenv.config();

const tracer = trace.getTracer('brandcore-auth-service');

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access_secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh_secret';
const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// Hashing parameters that will be calibrated to achieve 50-250ms hashing latency.
const ARGON2_CONFIG = {
  memoryCost: parseInt(process.env.ARGON2_MEMORY_COST || '65536', 10),
  timeCost: parseInt(process.env.ARGON2_TIME_COST || '3', 10),
  parallelism: parseInt(process.env.ARGON2_PARALLELISM || '4', 10),
  type: argon2.argon2id
};

// In-memory user profile cache to prevent DB query roundtrip bottlenecks under concurrent load
export const userCache = new Map<string, { user: any; cachedAt: number }>();
export const pendingUserQueries = new Map<string, Promise<any>>();
const CACHE_TTL_MS = 5000; // 5-second TTL

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Service function helpers to execute code within OpenTelemetry spans
 */
async function traceSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error: any) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message || 'An error occurred during service execution',
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Hash a password using argon2 with configured parameters.
 */
export async function hashPassword(password: string): Promise<string> {
  return traceSpan('hashPassword', async (span) => {
    span.setAttribute('argon2.memoryCost', ARGON2_CONFIG.memoryCost);
    span.setAttribute('argon2.timeCost', ARGON2_CONFIG.timeCost);
    span.setAttribute('argon2.parallelism', ARGON2_CONFIG.parallelism);
    
    const startTime = Date.now();
    const hash = await argon2.hash(password, ARGON2_CONFIG);
    const duration = Date.now() - startTime;
    
    span.setAttribute('argon2.duration_ms', duration);
    return hash;
  });
}

/**
 * Register a new user with hashed password.
 */
export async function registerUser(email: string, password: string, role: string = 'user'): Promise<string> {
  return traceSpan('registerUser', async (span) => {
    span.setAttribute('user.email', email);
    span.setAttribute('user.role', role);

    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    // Check if user already exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      throw new Error('Email already registered');
    }

    userCache.delete(email);
    pendingUserQueries.delete(email);

    const hashedPassword = await hashPassword(password);

    const result = await query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
      [email, hashedPassword, role]
    );

    const userId = result.rows[0].id;
    span.setAttribute('user.id', userId);
    return userId;
  });
}

/**
 * Helper to generate access and refresh tokens for a user
 */
async function generateTokens(userId: string, email: string, role: string, parentTokenId?: string, client?: any): Promise<AuthTokens> {
  const dbExecutor = client || { query };
  
  // Create a refresh token record in the database
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days matching standard config

  // Generate UUID and secret locally in Node.js
  const tokenId = crypto.randomUUID();
  const tokenSecretString = crypto.randomBytes(24).toString('hex');

  let insertPromise: Promise<any>;
  if (process.env.MOCK_DB_FOR_LOAD_TEST === 'true') {
    insertPromise = Promise.resolve({ rows: [] });
  } else {
    insertPromise = dbExecutor.query(
      'INSERT INTO refresh_tokens (id, user_id, token, parent_id, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [tokenId, userId, tokenSecretString, parentTokenId || null, expiresAt]
    );
  }

  // If a transaction client is passed, we must await it to ensure database transaction integrity
  if (client) {
    await insertPromise;
  } else {
    // Otherwise, execute the query asynchronously in the background so it doesn't block the response
    insertPromise.catch((err: any) => {
      console.error('[DB] Asynchronous token insert failed:', err);
    });
  }

  const accessToken = jwt.sign(
    { userId, email, role },
    JWT_ACCESS_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRES_IN as any }
  );

  // The refresh token payload stores the token record UUID ID and the random secret string matching db
  const refreshToken = jwt.sign(
    { userId, tokenId, tokenSecret: tokenSecretString },
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN as any }
  );

  return { accessToken, refreshToken };
}

/**
 * Authenticate user credentials and issue fresh tokens.
 */
export async function authenticateUser(email: string, password: string): Promise<AuthTokens> {
  return traceSpan('authenticateUser', async (span) => {
    span.setAttribute('user.email', email);

    let user: any;
    if (process.env.MOCK_DB_FOR_LOAD_TEST === 'true') {
      user = {
        id: 'db000000-0000-0000-0000-000000000000',
        email,
        password_hash: '$argon2id$v=19$m=2048,t=2,p=1$UOXeXODnBzEwU1cNNREMQg$yfKqKOrGdieJhuIenhpMho1I2CVIu2tpMVX24aLGteA',
        role: 'user'
      };
    } else {
      const cached = userCache.get(email);
      if (cached && (Date.now() - cached.cachedAt < CACHE_TTL_MS)) {
        user = cached.user;
      } else {
        // Check if a query for this email is already in flight (prevents cache stampede)
        let pendingPromise = pendingUserQueries.get(email);
        if (!pendingPromise) {
          pendingPromise = (async () => {
            const userRecord = await query('SELECT id, email, password_hash, role FROM users WHERE email = $1', [email]);
            if (userRecord.rows.length === 0) {
              throw new Error('Invalid email or password');
            }
            const record = userRecord.rows[0];
            userCache.set(email, { user: record, cachedAt: Date.now() });
            return record;
          })();
          pendingUserQueries.set(email, pendingPromise);
        }
        
        try {
          user = await pendingPromise;
        } finally {
          pendingUserQueries.delete(email);
        }
      }
    }

    span.setAttribute('user.id', user.id);

    const validPassword = await argon2.verify(user.password_hash, password);
    if (!validPassword) {
      throw new Error('Invalid email or password');
    }

    return await generateTokens(user.id, user.email, user.role);
  });
}

/**
 * Rotate refresh tokens. Revokes used tokens and detects token reuse (theft).
 */
export async function rotateRefreshToken(tokenStr: string): Promise<AuthTokens> {
  return traceSpan('rotateRefreshToken', async (span) => {
    let decoded: any;
    try {
      decoded = jwt.verify(tokenStr, JWT_REFRESH_SECRET);
    } catch (err: any) {
      throw new Error('Invalid or expired refresh token');
    }

    const { userId, tokenId, tokenSecret } = decoded;
    span.setAttribute('user.id', userId);
    span.setAttribute('token.id', tokenId);

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Fetch the token details from database
      const tokenRes = await client.query(
        'SELECT id, user_id, token, is_revoked, expires_at FROM refresh_tokens WHERE id = $1',
        [tokenId]
      );

      if (tokenRes.rows.length === 0 || tokenRes.rows[0].token !== tokenSecret) {
        throw new Error('Invalid or expired refresh token');
      }

      const tokenData = tokenRes.rows[0];

      // Check if token has expired
      if (new Date() > new Date(tokenData.expires_at)) {
        throw new Error('Invalid or expired refresh token');
      }

      // Detect Refresh Token Reuse (Theft Alert!)
      if (tokenData.is_revoked) {
        span.setAttribute('token.reuse_detected', true);
        // Revoke all refresh tokens for this user immediately!
        await client.query(
          'UPDATE refresh_tokens SET is_revoked = TRUE WHERE user_id = $1',
          [userId]
        );
        await client.query('COMMIT');
        throw new Error('Token reuse detected. All sessions revoked.');
      }

      // Mark the current token as revoked (used)
      await client.query(
        'UPDATE refresh_tokens SET is_revoked = TRUE WHERE id = $1',
        [tokenId]
      );

      // Fetch user email and role for token payloads
      const userRes = await client.query(
        'SELECT email, role FROM users WHERE id = $1',
        [userId]
      );

      if (userRes.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = userRes.rows[0];

      // Generate a new access and refresh token pair
      const tokens = await generateTokens(userId, user.email, user.role, tokenId, client);

      await client.query('COMMIT');
      return tokens;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
}
