import request from 'supertest';
import app from '../src/app';
import { initializeDatabase, cleanDatabase, closeDatabase, query } from '../src/db';
import { sentEmailsOutbox, clearSentEmailsOutbox } from '../src/services/email.service';

describe('Password reset', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
    clearSentEmailsOutbox();
    delete process.env.RESEND_API_KEY;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  async function registerAndGetResetToken(email: string, password = 'originalPassword123') {
    await request(app).post('/api/auth/register').send({ email, password });
    clearSentEmailsOutbox();
    await request(app).post('/api/auth/forgot-password').send({ email });
    const match = sentEmailsOutbox[0].text.match(/token=([a-f0-9]+)/);
    return match![1];
  }

  describe('POST /api/auth/forgot-password', () => {
    it('sends a reset email for an existing local account', async () => {
      await request(app).post('/api/auth/register').send({ email: 'resetme@example.com', password: 'password123' });
      clearSentEmailsOutbox();

      const res = await request(app).post('/api/auth/forgot-password').send({ email: 'resetme@example.com' });
      expect(res.status).toBe(200);
      expect(sentEmailsOutbox).toHaveLength(1);
      expect(sentEmailsOutbox[0].text).toContain('/reset-password?token=');
    });

    it('responds identically for a nonexistent email (no account-existence leak)', async () => {
      const res = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody-here@example.com' });
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('If an account exists');
      expect(sentEmailsOutbox).toHaveLength(0);
    });

    it('does not send a reset email for a Google-only account (nothing to reset)', async () => {
      jest.spyOn(global as any, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ aud: 'test-google-client-id', sub: 'g-sub-1', email: 'googleonly@example.com', email_verified: 'true' }),
      } as any);
      process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
      await request(app).post('/api/auth/google').send({ accessToken: 'fake' });
      delete process.env.GOOGLE_CLIENT_ID;
      jest.restoreAllMocks();
      clearSentEmailsOutbox();

      const res = await request(app).post('/api/auth/forgot-password').send({ email: 'googleonly@example.com' });
      expect(res.status).toBe(200);
      expect(sentEmailsOutbox).toHaveLength(0);
    });

    it('400s when email is missing', async () => {
      const res = await request(app).post('/api/auth/forgot-password').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('resets the password and allows login with the new one', async () => {
      const token = await registerAndGetResetToken('changeit@example.com');

      const res = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'brandNewPassword456' });
      expect(res.status).toBe(200);

      const oldLogin = await request(app).post('/api/auth/login').send({ email: 'changeit@example.com', password: 'originalPassword123' });
      expect(oldLogin.status).toBe(401);

      const newLogin = await request(app).post('/api/auth/login').send({ email: 'changeit@example.com', password: 'brandNewPassword456' });
      expect(newLogin.status).toBe(200);
    });

    it('revokes existing refresh tokens on reset (forces re-login everywhere)', async () => {
      const registerRes = await request(app).post('/api/auth/register').send({ email: 'revokeme@example.com', password: 'originalPassword123' });
      const oldRefreshToken = registerRes.body.refreshToken;

      clearSentEmailsOutbox();
      await request(app).post('/api/auth/forgot-password').send({ email: 'revokeme@example.com' });
      const token = sentEmailsOutbox[0].text.match(/token=([a-f0-9]+)/)![1];
      await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'brandNewPassword456' });

      const refreshAttempt = await request(app).post('/api/auth/refresh').send({ refreshToken: oldRefreshToken });
      expect(refreshAttempt.status).toBe(401);
    });

    it('the token is single-use', async () => {
      const token = await registerAndGetResetToken('singleuse@example.com');

      const first = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'firstNewPassword1' });
      expect(first.status).toBe(200);

      const second = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'secondNewPassword2' });
      expect(second.status).toBe(400);
    });

    it('rejects an expired token', async () => {
      const token = await registerAndGetResetToken('expiredreset@example.com');
      await query("UPDATE password_reset_tokens SET expires_at = NOW() - INTERVAL '1 hour' WHERE token = $1", [token]);

      const res = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'wontMatterPassword1' });
      expect(res.status).toBe(400);
    });

    it('rejects a garbage token', async () => {
      const res = await request(app).post('/api/auth/reset-password').send({ token: 'not-a-real-token', newPassword: 'somePassword123' });
      expect(res.status).toBe(400);
    });

    it('rejects a password under 8 characters', async () => {
      const token = await registerAndGetResetToken('shortpw@example.com');
      const res = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'short' });
      expect(res.status).toBe(400);
    });

    it('400s when token or newPassword is missing', async () => {
      const res = await request(app).post('/api/auth/reset-password').send({});
      expect(res.status).toBe(400);
    });
  });
});
