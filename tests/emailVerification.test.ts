import request from 'supertest';
import app from '../src/app';
import { initializeDatabase, cleanDatabase, closeDatabase, query } from '../src/db';
import { sendVerificationEmail, verifyEmailToken } from '../src/services/auth.service';
import { sentEmailsOutbox, clearSentEmailsOutbox } from '../src/services/email.service';
import { getTestAuthSession } from './helpers/testAuth';

describe('Email verification', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
    clearSentEmailsOutbox();
    delete process.env.RESEND_API_KEY; // force the log/outbox fallback path
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe('Registration flow', () => {
    it('creates a new local account unverified and sends a verification email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'newuser@example.com', password: 'password123' });

      expect(res.status).toBe(201);
      expect(res.body.user.emailVerified).toBe(false);

      expect(sentEmailsOutbox).toHaveLength(1);
      expect(sentEmailsOutbox[0].to).toBe('newuser@example.com');
      expect(sentEmailsOutbox[0].text).toContain('/verify-email?token=');
    });

    it('seeded demo accounts are pre-verified', async () => {
      const session = await getTestAuthSession(); // logs in as vedang@brandcore.com, seeding it
      expect(session).toBeTruthy();

      const row = await query('SELECT email_verified FROM users WHERE id = $1', [session.userId]);
      expect(row.rows[0].email_verified).toBe(true);
    });
  });

  describe('verifyEmailToken / GET /api/auth/verify-email', () => {
    it('verifies a valid token and marks the user verified', async () => {
      const reg = await request(app).post('/api/auth/register').send({ email: 'verify-me@example.com', password: 'password123' });
      const token = sentEmailsOutbox[0].text.match(/token=([a-f0-9]+)/)![1];

      const res = await request(app).get(`/api/auth/verify-email?token=${token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.alreadyVerified).toBe(false);

      const row = await query('SELECT email_verified FROM users WHERE id = $1', [reg.body.userId]);
      expect(row.rows[0].email_verified).toBe(true);
    });

    it('reports alreadyVerified on a second use attempt without erroring the first', async () => {
      const reg = await request(app).post('/api/auth/register').send({ email: 'verify-twice@example.com', password: 'password123' });
      const token = sentEmailsOutbox[0].text.match(/token=([a-f0-9]+)/)![1];

      const first = await request(app).get(`/api/auth/verify-email?token=${token}`);
      expect(first.status).toBe(200);

      // The token itself is single-use (used_at is set), so a second hit
      // with the SAME token now fails - this asserts that, and separately
      // asserts the idempotent-verify path via the service function on a
      // still-valid second token for the same (now-verified) user.
      const secondSameToken = await request(app).get(`/api/auth/verify-email?token=${token}`);
      expect(secondSameToken.status).toBe(400);

      await sendVerificationEmail(reg.body.userId, 'verify-twice@example.com');
      const secondToken = sentEmailsOutbox[sentEmailsOutbox.length - 1].text.match(/token=([a-f0-9]+)/)![1];
      const result = await verifyEmailToken(secondToken);
      expect(result.success).toBe(true);
      expect(result.alreadyVerified).toBe(true);
    });

    it('rejects a garbage/nonexistent token with 400', async () => {
      const res = await request(app).get('/api/auth/verify-email?token=not-a-real-token');
      expect(res.status).toBe(400);
    });

    it('rejects an expired token', async () => {
      const reg = await request(app).post('/api/auth/register').send({ email: 'expired@example.com', password: 'password123' });
      const token = sentEmailsOutbox[0].text.match(/token=([a-f0-9]+)/)![1];

      await query("UPDATE email_verification_tokens SET expires_at = NOW() - INTERVAL '1 hour' WHERE token = $1", [token]);

      const res = await request(app).get(`/api/auth/verify-email?token=${token}`);
      expect(res.status).toBe(400);

      const row = await query('SELECT email_verified FROM users WHERE id = $1', [reg.body.userId]);
      expect(row.rows[0].email_verified).toBe(false);
    });

    it('400s when token is missing', async () => {
      const res = await request(app).get('/api/auth/verify-email');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/resend-verification', () => {
    it('requires authentication', async () => {
      const res = await request(app).post('/api/auth/resend-verification');
      expect(res.status).toBe(401);
    });

    it('sends another verification email to the authenticated user', async () => {
      const reg = await request(app).post('/api/auth/register').send({ email: 'resend-me@example.com', password: 'password123' });
      clearSentEmailsOutbox();

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('Authorization', `Bearer ${reg.body.accessToken}`);

      expect(res.status).toBe(200);
      expect(sentEmailsOutbox).toHaveLength(1);
      expect(sentEmailsOutbox[0].to).toBe('resend-me@example.com');
    });
  });

  describe('Login is not blocked by an unverified email', () => {
    it('lets an unverified local account log in (soft gate, not hard block)', async () => {
      await request(app).post('/api/auth/register').send({ email: 'unverified-login@example.com', password: 'password123' });

      const res = await request(app).post('/api/auth/login').send({ email: 'unverified-login@example.com', password: 'password123' });
      expect(res.status).toBe(200);
      expect(res.body.user.emailVerified).toBe(false);
    });
  });
});
