import request from 'supertest';
import app from '../src/app';
import { initializeDatabase, cleanDatabase, closeDatabase } from '../src/db';
import { userCache, pendingUserQueries } from '../src/services/auth.service';

describe('Auth & User Management API Integration Tests', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
    userCache.clear();
    pendingUserQueries.clear();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  // Scenario 1: Happy Path
  // Registration -> Login -> Token Refresh
  it('Scenario 1 (Happy Path): should register, login, and rotate refresh token', async () => {
    // 1. Register User
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'happy@example.com',
        password: 'Password123!',
        role: 'user'
      });
    
    expect(regRes.status).toBe(201);
    expect(regRes.body).toHaveProperty('userId');
    expect(regRes.body.message).toBe('User registered successfully');

    // 2. Login User
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'happy@example.com',
        password: 'Password123!'
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toHaveProperty('accessToken');
    expect(loginRes.body).toHaveProperty('refreshToken');

    const firstRefreshToken = loginRes.body.refreshToken;

    // 3. Refresh Access Token
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({
        refreshToken: firstRefreshToken
      });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body).toHaveProperty('accessToken');
    expect(refreshRes.body).toHaveProperty('refreshToken');
    expect(refreshRes.body.refreshToken).not.toBe(firstRefreshToken);
  });

  // Security regression (HANDOFF.md §22): handleRegister used to
  // destructure `role` straight from this public, unauthenticated request
  // body and pass it through to registerUser() unvalidated - a self-
  // registered account could set role: 'admin' and immediately receive a
  // real admin-scoped JWT, a complete RBAC bypass (requireRole('admin')
  // gates real endpoints in observability.controller.ts). Confirmed
  // exploitable with a plain curl POST during this session's security
  // review before being fixed. This test would have caught it.
  it('ignores a client-supplied role and always registers as a plain user, even when "admin" is requested', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'privesc-attempt@example.com', password: 'Password123!', role: 'admin' });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('user');

    // The issued JWT itself must not carry 'admin' either - not just the
    // response body's cosmetic `user.role` field.
    const payload = JSON.parse(Buffer.from(res.body.accessToken.split('.')[1], 'base64').toString());
    expect(payload.role).toBe('user');

    // And the row actually persisted in the database must agree - the
    // real thing requireRole() checks on every subsequent request, not
    // just what this one response happened to say.
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'privesc-attempt@example.com', password: 'Password123!' });
    const loginPayload = JSON.parse(Buffer.from(loginRes.body.accessToken.split('.')[1], 'base64').toString());
    expect(loginPayload.role).toBe('user');
  });

  // Scenario 1b: Logout revokes the refresh token server-side
  it('Scenario 1b (Logout): should revoke the refresh token on logout so it can no longer be used', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'logout_test@example.com', password: 'Password123!' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'logout_test@example.com', password: 'Password123!' });

    const { refreshToken } = loginRes.body;

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken });

    expect(logoutRes.status).toBe(200);

    // The revoked token must now be rejected by refresh (reuse-detection path).
    const reuseAfterLogoutRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(reuseAfterLogoutRes.status).toBe(401);
  });

  it('Scenario 1c (Logout edge cases): should return 200 for missing/garbage refresh tokens without throwing', async () => {
    const noTokenRes = await request(app).post('/api/auth/logout').send({});
    expect(noTokenRes.status).toBe(200);

    const garbageTokenRes = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: 'not-a-real-token' });
    expect(garbageTokenRes.status).toBe(200);
  });

  // Scenario 2: Edge Case (Refresh Token Rotation Reuse Detection)
  it('Scenario 2 (Edge Case): should detect token reuse and reject subsequent rotations', async () => {
    // 1. Register and Login
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'reuse_edge@example.com', password: 'Password123!' });
    
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'reuse_edge@example.com', password: 'Password123!' });
    
    const originalRefresh = loginRes.body.refreshToken;

    // 2. First Rotation
    const rotate1Res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: originalRefresh });
    
    expect(rotate1Res.status).toBe(200);
    const newRefresh = rotate1Res.body.refreshToken;

    // 3. Reuse Original Token (Theft attempt!)
    const reuseRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: originalRefresh });
    
    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.error).toContain('Token reuse detected');

    // 4. Verify that new token was also invalidated due to reuse detection
    const verifyRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: newRefresh });
    
    expect(verifyRes.status).toBe(401);
  });

  // Scenario 3: Failure Modes (Validation, invalid credentials, tampered token)
  it('Scenario 3 (Failure Modes): should reject logins and refreshes with invalid parameters', async () => {
    // 1. Register User
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'failure_mode@example.com', password: 'Password123!' });

    // 2. Login with bad password
    const badPassRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'failure_mode@example.com', password: 'WrongPassword!' });
    
    expect(badPassRes.status).toBe(401);
    expect(badPassRes.body.error).toBe('Invalid email or password');

    // 3. Refresh with tampered refresh token
    const tamperedRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'this.is.a.tampered.token' });
    
    expect(tamperedRes.status).toBe(401);
    expect(tamperedRes.body.error).toContain('Invalid or expired');

    // 4. Register duplicate email
    const dupRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'failure_mode@example.com', password: 'Password123!' });
    
    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error).toBe('Email already registered');
  });

  // Additional tests for 100% controller coverage
  it('should reject register requests with missing parameters', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'only_email@example.com' }); // missing password
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email and password are required');
  });

  it('should reject login requests with missing parameters', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'only_password' }); // missing email
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email and password are required');
  });

  it('should reject refresh requests with missing parameters', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({}); // missing refreshToken
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Refresh token is required');
  });

  it('should return 500 when register service throws an unexpected error', async () => {
    const authService = require('../src/services/auth.service');
    const spy = jest.spyOn(authService, 'registerUser').mockRejectedValueOnce(new Error('Database crashed'));
    
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'err@example.com', password: 'Password123!' });
    
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Database crashed');
    spy.mockRestore();
  });

  it('should return 500 when login service throws an unexpected error', async () => {
    const authService = require('../src/services/auth.service');
    const spy = jest.spyOn(authService, 'authenticateUser').mockRejectedValueOnce(new Error('Auth system down'));
    
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'err@example.com', password: 'Password123!' });
    
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Auth system down');
    spy.mockRestore();
  });

  it('should return 500 when refresh service throws an unexpected error', async () => {
    const authService = require('../src/services/auth.service');
    const spy = jest.spyOn(authService, 'rotateRefreshToken').mockRejectedValueOnce(new Error('Rotation system failed'));
    
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'some.refresh.token' });
    
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Rotation system failed');
    spy.mockRestore();
  });
});
