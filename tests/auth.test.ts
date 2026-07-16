import { initializeDatabase, cleanDatabase, closeDatabase } from '../src/db';
import { registerUser, authenticateUser, rotateRefreshToken, hashPassword, userCache, pendingUserQueries } from '../src/services/auth.service';
import * as jwt from 'jsonwebtoken';

const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh_secret';

describe('Auth Services Unit Tests', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    // Initialize the DB schema before running tests
    await initializeDatabase();
  });

  beforeEach(async () => {
    // Truncate tables for a clean slate
    await cleanDatabase();
    userCache.clear();
    pendingUserQueries.clear();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe('hashPassword', () => {
    it('should hash password and verify it takes a measurable time', async () => {
      const password = 'my_secure_password';
      const start = Date.now();
      const hash = await hashPassword(password);
      const duration = Date.now() - start;
      
      expect(hash).toBeDefined();
      expect(hash).toContain('$argon2id$');
      console.log(`[Test] Argon2 hashing duration: ${duration}ms`);
    });
  });

  describe('registerUser', () => {
    it('should successfully register a user', async () => {
      const userId = await registerUser('test@example.com', 'password123', 'admin');
      expect(userId).toBeDefined();
      expect(typeof userId).toBe('string');
    });

    it('should prevent registration with duplicate email', async () => {
      await registerUser('dup@example.com', 'password123');
      await expect(registerUser('dup@example.com', 'password456'))
        .rejects.toThrow('Email already registered');
    });

    it('should validate inputs', async () => {
      await expect(registerUser('', 'password')).rejects.toThrow();
      await expect(registerUser('email@test.com', '')).rejects.toThrow();
    });
  });

  describe('authenticateUser', () => {
    it('should authenticate user and return access and refresh tokens', async () => {
      await registerUser('auth@example.com', 'password123', 'user');
      const tokens = await authenticateUser('auth@example.com', 'password123');
      
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();

      const decodedAccess = jwt.verify(tokens.accessToken, process.env.JWT_ACCESS_SECRET || 'access_secret') as any;
      expect(decodedAccess.email).toBe('auth@example.com');
      expect(decodedAccess.role).toBe('user');
    });

    it('should reject authentication for non-existent email', async () => {
      await expect(authenticateUser('nonexistent@example.com', 'password123'))
        .rejects.toThrow('Invalid email or password');
    });

    it('should reject authentication for invalid password', async () => {
      await registerUser('auth2@example.com', 'password123');
      await expect(authenticateUser('auth2@example.com', 'wrongpassword'))
        .rejects.toThrow('Invalid email or password');
    });
  });

  describe('rotateRefreshToken', () => {
    it('should rotate tokens and mark old token as revoked', async () => {
      await registerUser('rotate@example.com', 'password123');
      const tokens = await authenticateUser('rotate@example.com', 'password123');

      const rotated = await rotateRefreshToken(tokens.refreshToken);
      expect(rotated.accessToken).toBeDefined();
      expect(rotated.refreshToken).toBeDefined();
      expect(rotated.refreshToken).not.toBe(tokens.refreshToken);
    });

    it('should fail with tampered refresh token', async () => {
      await expect(rotateRefreshToken('invalid.token.payload'))
        .rejects.toThrow('Invalid or expired refresh token');
    });

    it('should detect token reuse and revoke all user tokens', async () => {
      await registerUser('reuse@example.com', 'password123');
      const tokens = await authenticateUser('reuse@example.com', 'password123');

      // First rotation works
      const rotated1 = await rotateRefreshToken(tokens.refreshToken);
      expect(rotated1.accessToken).toBeDefined();

      // Second rotation with SAME old token (reuse/theft attempt!)
      await expect(rotateRefreshToken(tokens.refreshToken))
        .rejects.toThrow('Token reuse detected. All sessions revoked.');

      // New tokens issued on first rotation should also be revoked/invalid now
      await expect(rotateRefreshToken(rotated1.refreshToken))
        .rejects.toThrow('Token reuse detected. All sessions revoked.');
    });

    it('should fail if token signature is valid but tokenId does not exist in database', async () => {
      const fakeToken = jwt.sign(
        { userId: '00000000-0000-0000-0000-000000000000', tokenId: '00000000-0000-0000-0000-000000000000', tokenSecret: 'does_not_matter' },
        JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
      );
      await expect(rotateRefreshToken(fakeToken))
        .rejects.toThrow('Invalid or expired refresh token');
    });
  });
});
