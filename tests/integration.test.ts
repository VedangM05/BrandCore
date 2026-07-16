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
