import { AuthSession, AuthUser } from '../api/auth';

const ACCESS_TOKEN_KEY = 'brandcore_access_token';
const REFRESH_TOKEN_KEY = 'brandcore_refresh_token';
const USER_KEY = 'brandcore_user';

/**
 * Single source of truth for reading/writing the persisted auth session.
 * Previously AuthContext duplicated these localStorage keys/helpers on its own;
 * centralizing them here lets the authenticated API client (client.ts) share
 * the exact same storage without a second, drift-prone copy.
 */
export function readStoredSession(): AuthSession | null {
  try {
    const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    const userRaw = localStorage.getItem(USER_KEY);
    if (!accessToken || !refreshToken || !userRaw) return null;
    const user = JSON.parse(userRaw) as AuthUser;
    if (!user?.userId || !user?.email) return null;
    return { accessToken, refreshToken, user };
  } catch {
    return null;
  }
}

export function writeStoredSession(session: AuthSession): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
}

export function clearStoredSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}
