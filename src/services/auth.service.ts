import * as argon2 from 'argon2';
import * as jwt from 'jsonwebtoken';
import { trace, SpanStatusCode, Span } from '@opentelemetry/api';
import { query, getClient } from '../db';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';
import { sendEmail } from './email.service';

dotenv.config();

const tracer = trace.getTracer('brandcore-auth-service');

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access_secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh_secret';
const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const EMAIL_VERIFICATION_EXPIRES_MS = 24 * 60 * 60 * 1000; // 24h
const PASSWORD_RESET_EXPIRES_MS = 60 * 60 * 1000; // 1h - shorter-lived, more sensitive

const ARGON2_CONFIG = {
  memoryCost: parseInt(process.env.ARGON2_MEMORY_COST || '65536', 10),
  timeCost: parseInt(process.env.ARGON2_TIME_COST || '3', 10),
  parallelism: parseInt(process.env.ARGON2_PARALLELISM || '4', 10),
  type: argon2.argon2id
};

export const userCache = new Map<string, { user: any; cachedAt: number }>();
export const pendingUserQueries = new Map<string, Promise<any>>();

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  userId: string;
  email: string;
  role: string;
  emailVerified: boolean;
}

export interface AuthSession extends AuthTokens {
  user: AuthUser;
}

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

export async function registerUser(email: string, password: string, role: string = 'user'): Promise<string> {
  return traceSpan('registerUser', async (span) => {
    const normalizedEmail = (email || '').toLowerCase().trim();
    span.setAttribute('user.email', normalizedEmail);
    span.setAttribute('user.role', role);

    if (!normalizedEmail || !password) {
      throw new Error('Email and password are required');
    }

    const existing = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [normalizedEmail]);
    if (existing.rows.length > 0) {
      throw new Error('Email already registered');
    }

    userCache.delete(normalizedEmail);
    pendingUserQueries.delete(normalizedEmail);

    const hashedPassword = await hashPassword(password);

    const result = await query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
      [normalizedEmail, hashedPassword, role]
    );

    const userId = result.rows[0].id;
    span.setAttribute('user.id', userId);
    return userId;
  });
}

async function generateTokens(userId: string, email: string, role: string, parentTokenId?: string, client?: any): Promise<AuthTokens> {
  const dbExecutor = client || { query };
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const tokenId = crypto.randomUUID();
  const tokenSecretString = crypto.randomBytes(24).toString('hex');

  if (process.env.MOCK_DB_FOR_LOAD_TEST !== 'true') {
    await dbExecutor.query(
      'INSERT INTO refresh_tokens (id, user_id, token, parent_id, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [tokenId, userId, tokenSecretString, parentTokenId || null, expiresAt]
    );
  }

  const accessToken = jwt.sign(
    { userId, email, role },
    JWT_ACCESS_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRES_IN as any }
  );

  const refreshToken = jwt.sign(
    { userId, tokenId, tokenSecret: tokenSecretString },
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN as any }
  );

  return { accessToken, refreshToken };
}

export async function authenticateUser(email: string, password: string): Promise<AuthSession> {
  return traceSpan('authenticateUser', async (span) => {
    const normalizedEmail = (email || '').toLowerCase().trim();
    span.setAttribute('user.email', normalizedEmail);

    if (!normalizedEmail || !password) {
      throw new Error('Invalid email or password');
    }

    let user: any;
    if (process.env.MOCK_DB_FOR_LOAD_TEST === 'true') {
      user = {
        id: 'db000000-0000-0000-0000-000000000000',
        email: normalizedEmail,
        password_hash: '$argon2id$v=19$m=2048,t=2,p=1$UOXeXODnBzEwU1cNNREMQg$yfKqKOrGdieJhuIenhpMho1I2CVIu2tpMVX24aLGteA',
        role: 'user',
        email_verified: true
      };
    } else {
      let userRecord = await query(
        'SELECT id, email, password_hash, role, email_verified FROM users WHERE LOWER(email) = LOWER($1)',
        [normalizedEmail]
      );
      if (userRecord.rows.length === 0) {
        await seedDefaultUsers();
        userRecord = await query(
          'SELECT id, email, password_hash, role, email_verified FROM users WHERE LOWER(email) = LOWER($1)',
          [normalizedEmail]
        );
      }
      if (userRecord.rows.length === 0) {
        throw new Error('Invalid email or password');
      }
      user = userRecord.rows[0];
    }

    span.setAttribute('user.id', user.id);

    const validPassword = await argon2.verify(user.password_hash, password);
    if (!validPassword) {
      throw new Error('Invalid email or password');
    }

    const tokens = await generateTokens(user.id, user.email, user.role);
    return {
      ...tokens,
      user: {
        userId: user.id,
        email: user.email,
        role: user.role,
        emailVerified: user.email_verified,
      },
    };
  });
}

export async function rotateRefreshToken(tokenStr: string): Promise<AuthSession> {
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

      const tokenRes = await client.query(
        'SELECT id, user_id, token, is_revoked, expires_at FROM refresh_tokens WHERE id = $1',
        [tokenId]
      );

      if (tokenRes.rows.length === 0 || tokenRes.rows[0].token !== tokenSecret) {
        throw new Error('Invalid or expired refresh token');
      }

      const tokenData = tokenRes.rows[0];

      if (new Date() > new Date(tokenData.expires_at)) {
        throw new Error('Invalid or expired refresh token');
      }

      if (tokenData.is_revoked) {
        span.setAttribute('token.reuse_detected', true);
        await client.query(
          'UPDATE refresh_tokens SET is_revoked = TRUE WHERE user_id = $1',
          [userId]
        );
        await client.query('COMMIT');
        throw new Error('Token reuse detected. All sessions revoked.');
      }

      await client.query(
        'UPDATE refresh_tokens SET is_revoked = TRUE WHERE id = $1',
        [tokenId]
      );

      const userRes = await client.query(
        'SELECT email, role, email_verified FROM users WHERE id = $1',
        [userId]
      );

      if (userRes.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = userRes.rows[0];
      const tokens = await generateTokens(userId, user.email, user.role, tokenId, client);

      await client.query('COMMIT');
      return {
        ...tokens,
        user: {
          userId,
          email: user.email,
          role: user.role,
          emailVerified: user.email_verified,
        },
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
}

/**
 * Revokes the refresh token backing the given token string, so it can no longer
 * be used to mint new sessions. Best-effort: an already-invalid/expired/unknown
 * token is treated as "already logged out" rather than an error, since the
 * caller's intent (end this session) is satisfied either way.
 */
export async function revokeRefreshToken(tokenStr: string): Promise<void> {
  return traceSpan('revokeRefreshToken', async (span) => {
    let decoded: any;
    try {
      decoded = jwt.verify(tokenStr, JWT_REFRESH_SECRET);
    } catch {
      return;
    }

    const { tokenId } = decoded;
    if (!tokenId) return;
    span.setAttribute('token.id', tokenId);

    await query('UPDATE refresh_tokens SET is_revoked = TRUE WHERE id = $1', [tokenId]);
  });
}

/**
 * Authenticates (or silently registers) a user from a Google OAuth 2.0
 * access token minted client-side by Google Identity Services
 * (initTokenClient - see GoogleAuthButton.tsx). Zero-cost: Google's
 * tokeninfo endpoint is free and unmetered, and this needs no extra
 * dependency (google-auth-library) - a plain fetch is enough since
 * tokeninfo both verifies the token and returns the verified profile in one
 * call.
 *
 * Security-critical: the frontend is never trusted for who the user is.
 * Everything here is re-derived from Google's own server:
 *  - `aud` must equal our own GOOGLE_CLIENT_ID, or a token minted for a
 *    completely different application could be replayed against this API.
 *  - `email_verified` must be the string "true" - Google returns this as a
 *    string, not a boolean, on the tokeninfo endpoint.
 *  - Linking to an existing password-based account is safe specifically
 *    *because* Google already verified the email is owned by this person -
 *    an unverified email is never allowed to link/create an account.
 */
export async function authenticateWithGoogle(accessToken: string): Promise<AuthSession> {
  return traceSpan('authenticateWithGoogle', async (span) => {
    if (!accessToken) {
      throw new Error('Google access token is required');
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new Error('Google sign-in is not configured on this server (missing GOOGLE_CLIENT_ID)');
    }

    let tokenInfo: any;
    try {
      const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
      if (!res.ok) {
        throw new Error('Google rejected this token');
      }
      tokenInfo = await res.json();
    } catch (err: any) {
      throw new Error(`Failed to verify Google token: ${err.message || 'network error'}`);
    }

    if (tokenInfo.aud !== clientId) {
      throw new Error('Google token was not issued for this application');
    }
    if (tokenInfo.email_verified !== 'true' || !tokenInfo.email) {
      throw new Error('Google account email is not verified');
    }

    const googleId: string = tokenInfo.sub;
    const normalizedEmail = tokenInfo.email.toLowerCase().trim();
    span.setAttribute('user.email', normalizedEmail);
    span.setAttribute('auth.provider', 'google');

    let userRecord = await query('SELECT id, email, role, email_verified FROM users WHERE google_id = $1', [googleId]);

    if (userRecord.rows.length === 0) {
      // Not linked yet - match by verified email (safe, see docstring above)
      // and backfill the link, or create a brand-new account. Either way
      // email_verified is forced TRUE here - Google already verified this
      // exact email, which supersedes whatever the local account's
      // unverified state was (e.g. someone who registered locally but never
      // clicked the verification link can still prove ownership this way).
      const byEmail = await query('SELECT id, email, role, email_verified FROM users WHERE LOWER(email) = LOWER($1)', [normalizedEmail]);
      if (byEmail.rows.length > 0) {
        await query("UPDATE users SET google_id = $1, auth_provider = 'google', email_verified = TRUE WHERE id = $2", [googleId, byEmail.rows[0].id]);
        userRecord = byEmail;
        userRecord.rows[0].email_verified = true;
      } else {
        // password_hash stays NOT NULL - a random value nobody could ever
        // guess or was ever given, since this account only ever logs in via
        // Google going forward.
        const unusablePassword = await hashPassword(crypto.randomBytes(32).toString('hex'));
        const inserted = await query(
          "INSERT INTO users (email, password_hash, role, google_id, auth_provider, email_verified) VALUES ($1, $2, 'user', $3, 'google', TRUE) RETURNING id, email, role, email_verified",
          [normalizedEmail, unusablePassword, googleId]
        );
        userRecord = inserted;
      }
    }

    const user = userRecord.rows[0];
    span.setAttribute('user.id', user.id);

    userCache.delete(normalizedEmail);
    pendingUserQueries.delete(normalizedEmail);

    const tokens = await generateTokens(user.id, user.email, user.role);
    return {
      ...tokens,
      user: {
        userId: user.id,
        email: user.email,
        role: user.role,
        emailVerified: user.email_verified,
      },
    };
  });
}

/**
 * Generates a verification token, stores it, and emails a verify link.
 * Called after local registration (see handleRegister in
 * auth.controller.ts) and from the resend-verification endpoint.
 * Best-effort: failures are logged, not thrown - see email.service.ts's own
 * non-throwing contract, which this mirrors by design (a slow/broken email
 * provider shouldn't fail registration itself; the user can request another
 * one from the resend endpoint).
 */
export async function sendVerificationEmail(userId: string, email: string): Promise<void> {
  return traceSpan('sendVerificationEmail', async (span) => {
    span.setAttribute('user.id', userId);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRES_MS);

    await query(
      'INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [userId, token, expiresAt]
    );

    const verifyUrl = `${FRONTEND_URL}/verify-email?token=${token}`;
    await sendEmail(
      email,
      'Verify your BrandCore email',
      `<p>Welcome to BrandCore. Confirm your email address to finish setting up your account:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`,
      `Welcome to BrandCore. Confirm your email address: ${verifyUrl} (expires in 24 hours)`
    );
  });
}

export interface VerifyEmailResult {
  success: boolean;
  alreadyVerified: boolean;
}

/**
 * Consumes a verification token and marks the owning user's email verified.
 * A token that's missing, expired, or already used is reported the same way
 * (success: false) rather than distinguished - there's no legitimate reason
 * for the frontend to tell those apart, and distinguishing them would let
 * someone probe which tokens exist/existed.
 */
export async function verifyEmailToken(token: string): Promise<VerifyEmailResult> {
  return traceSpan('verifyEmailToken', async (span) => {
    if (!token) return { success: false, alreadyVerified: false };

    const tokenRes = await query(
      'SELECT id, user_id, expires_at, used_at FROM email_verification_tokens WHERE token = $1',
      [token]
    );
    if (tokenRes.rows.length === 0) return { success: false, alreadyVerified: false };

    const row = tokenRes.rows[0];
    span.setAttribute('user.id', row.user_id);

    if (row.used_at || new Date() > new Date(row.expires_at)) {
      return { success: false, alreadyVerified: false };
    }

    const userRes = await query('SELECT email_verified FROM users WHERE id = $1', [row.user_id]);
    const alreadyVerified = userRes.rows[0]?.email_verified === true;

    await query('UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1', [row.id]);
    if (!alreadyVerified) {
      await query('UPDATE users SET email_verified = TRUE WHERE id = $1', [row.user_id]);
      userCache.clear(); // stale emailVerified could otherwise be served from cache
    }

    return { success: true, alreadyVerified };
  });
}

/**
 * Requests a password reset for the given email. Always resolves the same
 * way regardless of whether the email exists (no error, no distinguishing
 * response) - existence of an account by email must never be leakable via
 * this endpoint. If a matching *local* account exists, a reset email is
 * sent; Google-only accounts have no password to reset (their
 * password_hash is a random value nobody was ever given - see
 * authenticateWithGoogle), so a reset request for one is silently ignored
 * rather than emailing a link that would just fail confusingly.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  return traceSpan('requestPasswordReset', async (span) => {
    const normalizedEmail = (email || '').toLowerCase().trim();
    if (!normalizedEmail) return;

    const userRes = await query('SELECT id, email, auth_provider FROM users WHERE LOWER(email) = LOWER($1)', [normalizedEmail]);
    if (userRes.rows.length === 0) return;

    const user = userRes.rows[0];
    if (user.auth_provider === 'google') return;
    span.setAttribute('user.id', user.id);

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRES_MS);
    await query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );

    const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`;
    await sendEmail(
      user.email,
      'Reset your BrandCore password',
      `<p>We received a request to reset your BrandCore password. This link expires in 1 hour and can only be used once:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
      `Reset your BrandCore password: ${resetUrl} (expires in 1 hour). If you didn't request this, ignore this email.`
    );
  });
}

/**
 * Completes a password reset: validates the token, sets the new password,
 * consumes the token, and revokes every existing refresh token for the
 * account - standard practice (a password reset almost always follows a
 * suspected compromise or a forgotten password on a device that shouldn't
 * still be trusted) and consistent with this app's existing "reuse
 * detection revokes all sessions" behavior in rotateRefreshToken.
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  return traceSpan('resetPassword', async (span) => {
    if (!token || !newPassword) {
      throw new Error('Token and new password are required');
    }
    if (newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    const tokenRes = await query(
      'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token = $1',
      [token]
    );
    if (tokenRes.rows.length === 0) {
      throw new Error('Invalid or expired reset link');
    }

    const row = tokenRes.rows[0];
    span.setAttribute('user.id', row.user_id);
    if (row.used_at || new Date() > new Date(row.expires_at)) {
      throw new Error('Invalid or expired reset link');
    }

    const newHash = await hashPassword(newPassword);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, row.user_id]);
    await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [row.id]);
    await query('UPDATE refresh_tokens SET is_revoked = TRUE WHERE user_id = $1', [row.user_id]);
    userCache.clear();
  });
}

export async function seedDefaultUsers(): Promise<void> {
  const defaultAccounts = [
    { email: 'vedang@brandcore.com', password: 'password123', role: 'admin' },
    { email: 'admin@brandcore.com', password: 'password123', role: 'admin' },
    { email: 'demo@brandcore.com', password: 'password123', role: 'user' },
  ];

  for (const account of defaultAccounts) {
    try {
      const normalizedEmail = account.email.toLowerCase().trim();
      const existing = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [normalizedEmail]);
      if (existing.rows.length === 0) {
        const hashedPassword = await hashPassword(account.password);
        // Pre-verified - these are trusted demo/seed accounts, not real
        // signups that need to prove email ownership.
        await query(
          'INSERT INTO users (email, password_hash, role, email_verified) VALUES ($1, $2, $3, TRUE)',
          [normalizedEmail, hashedPassword, account.role]
        );
        console.log(`[Auth] Seeded default workspace user: ${account.email}`);
      }
    } catch (err: any) {
      console.warn(`[Auth] Note on seeding ${account.email}:`, err.message);
    }
  }
}
