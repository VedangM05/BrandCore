export interface AuthUser {
  userId: string;
  email: string;
  role: string;
  emailVerified: boolean;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface RegisterResponse {
  message: string;
  userId: string;
  accessToken?: string;
  refreshToken?: string;
  user?: AuthUser;
}

export interface ApiError {
  error: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function apiErrorMessage(status: number, data: Partial<ApiError>): string {
  if (data.error) return data.error;
  if (status === 401) return 'Invalid email or password';
  if (status === 409) return 'Email already registered';
  if (status === 502 || status === 503 || status === 504) {
    return 'Cannot reach the API server. In a separate terminal, run: npm run dev';
  }
  if (status === 500) {
    return data.error || 'Server error. Ensure the backend is running (npm run dev).';
  }
  return `Request failed (${status})`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(apiErrorMessage(response.status, data as Partial<ApiError>));
  }
  return data as T;
}

async function apiFetch(url: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error('Cannot reach the API server. Start the backend with: npm run dev');
  }
}

export async function registerUser(email: string, password: string): Promise<RegisterResponse> {
  const response = await apiFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalizeEmail(email), password, role: 'user' }),
  });
  return parseResponse<RegisterResponse>(response);
}

export async function loginUser(email: string, password: string): Promise<AuthSession> {
  const response = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalizeEmail(email), password }),
  });
  return parseResponse<AuthSession>(response);
}

/** Exchanges a Google OAuth access token (from GoogleAuthButton.tsx) for our own session. */
export async function loginWithGoogle(googleAccessToken: string): Promise<AuthSession> {
  const response = await apiFetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: googleAccessToken }),
  });
  return parseResponse<AuthSession>(response);
}

export async function refreshSession(refreshToken: string): Promise<AuthSession> {
  const response = await apiFetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  return parseResponse<AuthSession>(response);
}

/** Requests a password-reset email. Always resolves - see the backend's identical-response-either-way contract. */
export async function forgotPassword(email: string): Promise<void> {
  await apiFetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalizeEmail(email) }),
  }).then((r) => parseResponse(r));
}

/** Completes a password reset using the token from the emailed link. */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const response = await apiFetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });
  await parseResponse(response);
}

/** Consumes an email-verification token from the emailed link. */
export async function verifyEmail(token: string): Promise<{ success: boolean; alreadyVerified: boolean }> {
  const response = await apiFetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, { method: 'GET' });
  return parseResponse(response);
}

/**
 * Revokes the refresh token server-side so a signed-out session's token can't
 * be replayed. Best-effort - callers should clear local state regardless of
 * whether this succeeds (e.g. offline logout must still work locally).
 */
export async function logoutSession(refreshToken: string): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // Ignore network failures - local session is cleared by the caller either way.
  }
}
