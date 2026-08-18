import { authenticateUser } from '../../src/services/auth.service';

export interface TestAuthSession {
  authHeader: string;
  userId: string;
}

/**
 * Logs in as a seeded default workspace account and returns a ready-to-use
 * `Authorization: Bearer <token>` header value (plus the resolved userId) for
 * hitting protected routes in integration tests. Call this after
 * cleanDatabase()/seedDefaultUsers() has run, since it truncates and re-seeds
 * the users table.
 */
export async function getTestAuthSession(email: string = 'vedang@brandcore.com', password: string = 'password123'): Promise<TestAuthSession> {
  const session = await authenticateUser(email, password);
  return { authHeader: `Bearer ${session.accessToken}`, userId: session.user.userId };
}

/** Convenience wrapper when only the header value is needed. */
export async function getTestAuthHeader(email: string = 'vedang@brandcore.com', password: string = 'password123'): Promise<string> {
  const { authHeader } = await getTestAuthSession(email, password);
  return authHeader;
}
