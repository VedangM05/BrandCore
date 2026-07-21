export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface RegisterResponse {
  message: string;
  userId: string;
}

export interface ApiError {
  error: string;
}

function apiErrorMessage(status: number, data: Partial<ApiError>): string {
  if (data.error) return data.error;
  if (status === 502 || status === 503 || status === 504) {
    return 'Cannot reach the API server. In a separate terminal, run: npm run dev';
  }
  if (status === 500) {
    return 'Internal server error (500). Please ensure the backend is running (npm run dev) and check backend logs.';
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
    body: JSON.stringify({ email, password, role: 'user' }),
  });
  return parseResponse<RegisterResponse>(response);
}

export async function loginUser(email: string, password: string): Promise<AuthTokens> {
  const response = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return parseResponse<AuthTokens>(response);
}

export async function refreshTokens(refreshToken: string): Promise<AuthTokens> {
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  return parseResponse<AuthTokens>(response);
}
