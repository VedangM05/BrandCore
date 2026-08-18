import request from 'supertest';
import app from '../src/app';
import { initializeDatabase, cleanDatabase, closeDatabase, query } from '../src/db';
import { authenticateWithGoogle, userCache, pendingUserQueries } from '../src/services/auth.service';

// Google's tokeninfo endpoint can't be hit for real in a test (there's no
// way to mint a genuine Google access token here) - every test mocks
// global.fetch (Node's built-in fetch, same one authenticateWithGoogle
// calls) to return a Google-shaped response instead. This is the only place
// in the suite that mocks fetch; every other Gemini-backed test hits the
// real API, but Google's OAuth endpoints have no equivalent free-tier path
// to exercise for real here.
function mockGoogleTokenInfo(overrides: Partial<Record<string, any>> = {}) {
  const body = {
    aud: 'test-google-client-id',
    sub: 'google-sub-123',
    email: 'googleuser@example.com',
    email_verified: 'true',
    ...overrides,
  };
  return jest.spyOn(global as any, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => body,
  } as any);
}

describe('Sign in with Google', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
    userCache.clear();
    pendingUserQueries.clear();
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.GOOGLE_CLIENT_ID;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe('authenticateWithGoogle (service level)', () => {
    it('creates a new user on first sign-in and links it by google_id', async () => {
      mockGoogleTokenInfo();

      const session = await authenticateWithGoogle('fake-access-token');

      expect(session.user.email).toBe('googleuser@example.com');
      expect(session.accessToken).toBeTruthy();
      expect(session.refreshToken).toBeTruthy();

      const dbRow = await query('SELECT google_id, auth_provider, password_hash FROM users WHERE id = $1', [session.user.userId]);
      expect(dbRow.rows[0].google_id).toBe('google-sub-123');
      expect(dbRow.rows[0].auth_provider).toBe('google');
      expect(dbRow.rows[0].password_hash).toBeTruthy(); // still NOT NULL, just unusable
    });

    it('reuses the same account on a second sign-in (matched by google_id, no duplicate)', async () => {
      mockGoogleTokenInfo();
      const first = await authenticateWithGoogle('token-1');

      mockGoogleTokenInfo();
      const second = await authenticateWithGoogle('token-2');

      expect(second.user.userId).toBe(first.user.userId);
      const rows = await query('SELECT id FROM users WHERE google_id = $1', ['google-sub-123']);
      expect(rows.rows).toHaveLength(1);
    });

    it('links to an existing password-based account with the same verified email, instead of creating a duplicate', async () => {
      const { registerUser } = await import('../src/services/auth.service');
      const existingUserId = await registerUser('googleuser@example.com', 'somePassword123');

      mockGoogleTokenInfo();
      const session = await authenticateWithGoogle('fake-access-token');

      expect(session.user.userId).toBe(existingUserId);
      const rows = await query('SELECT google_id, auth_provider FROM users WHERE id = $1', [existingUserId]);
      expect(rows.rows[0].google_id).toBe('google-sub-123');
      expect(rows.rows[0].auth_provider).toBe('google');

      const allUsers = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', ['googleuser@example.com']);
      expect(allUsers.rows).toHaveLength(1); // no duplicate account
    });

    it('rejects a token whose audience does not match this app\'s client id', async () => {
      mockGoogleTokenInfo({ aud: 'someone-elses-client-id' });
      await expect(authenticateWithGoogle('fake-access-token')).rejects.toThrow('not issued for this application');
    });

    it('rejects an unverified email', async () => {
      mockGoogleTokenInfo({ email_verified: 'false' });
      await expect(authenticateWithGoogle('fake-access-token')).rejects.toThrow('email is not verified');
    });

    it('rejects when Google itself rejects the token', async () => {
      jest.spyOn(global as any, 'fetch').mockResolvedValue({ ok: false } as any);
      await expect(authenticateWithGoogle('fake-access-token')).rejects.toThrow('Google rejected this token');
    });

    it('fails clearly when GOOGLE_CLIENT_ID is not configured', async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      await expect(authenticateWithGoogle('fake-access-token')).rejects.toThrow('not configured');
    });

    it('rejects a missing access token', async () => {
      await expect(authenticateWithGoogle('')).rejects.toThrow('access token is required');
    });
  });

  describe('POST /api/auth/google', () => {
    it('returns a full session on success', async () => {
      mockGoogleTokenInfo();
      const res = await request(app).post('/api/auth/google').send({ accessToken: 'fake-access-token' });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('googleuser@example.com');
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.refreshToken).toBeTruthy();
    });

    it('400s when accessToken is missing', async () => {
      const res = await request(app).post('/api/auth/google').send({});
      expect(res.status).toBe(400);
    });

    it('401s when the token audience is wrong', async () => {
      mockGoogleTokenInfo({ aud: 'someone-elses-client-id' });
      const res = await request(app).post('/api/auth/google').send({ accessToken: 'fake-access-token' });
      expect(res.status).toBe(401);
    });

    it('503s when Google sign-in is not configured', async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      const res = await request(app).post('/api/auth/google').send({ accessToken: 'fake-access-token' });
      expect(res.status).toBe(503);
    });
  });
});
