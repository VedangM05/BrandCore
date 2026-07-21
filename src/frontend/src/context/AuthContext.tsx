import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { loginUser, refreshTokens, registerUser } from '../api/auth';
import { decodeJwtPayload, isTokenExpired } from '../lib/jwt';

const ACCESS_TOKEN_KEY = 'brandcore_access_token';
const REFRESH_TOKEN_KEY = 'brandcore_refresh_token';

export interface AuthUser {
  userId: string;
  email: string;
  role: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function readStoredTokens(): { accessToken: string | null; refreshToken: string | null } {
  try {
    return {
      accessToken: localStorage.getItem(ACCESS_TOKEN_KEY),
      refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY),
    };
  } catch {
    return { accessToken: null, refreshToken: null };
  }
}

function persistTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

function clearStoredTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

function userFromAccessToken(accessToken: string): AuthUser | null {
  const payload = decodeJwtPayload(accessToken);
  if (!payload?.userId || !payload.email) return null;
  return {
    userId: payload.userId,
    email: payload.email,
    role: payload.role || 'user',
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applySession = useCallback((accessToken: string, refreshToken: string) => {
    persistTokens(accessToken, refreshToken);
    setUser(userFromAccessToken(accessToken));
  }, []);

  const logout = useCallback(() => {
    clearStoredTokens();
    setUser(null);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession() {
      const { accessToken, refreshToken } = readStoredTokens();

      if (accessToken && !isTokenExpired(accessToken)) {
        if (!cancelled) setUser(userFromAccessToken(accessToken));
        if (!cancelled) setIsLoading(false);
        return;
      }

      if (refreshToken) {
        try {
          const tokens = await refreshTokens(refreshToken);
          if (!cancelled) applySession(tokens.accessToken, tokens.refreshToken);
        } catch {
          if (!cancelled) clearStoredTokens();
        }
      }

      if (!cancelled) setIsLoading(false);
    }

    hydrateSession();
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const tokens = await loginUser(email, password);
      applySession(tokens.accessToken, tokens.refreshToken);
    },
    [applySession]
  );

  const signup = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        await registerUser(email, password);
      } catch (err) {
        if (err instanceof Error && err.message === 'Email already registered') {
          throw new Error('This email is already registered. Sign in instead, or use a different email.');
        }
        throw err;
      }
      const tokens = await loginUser(email, password);
      applySession(tokens.accessToken, tokens.refreshToken);
    },
    [applySession]
  );

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: Boolean(user),
        error,
        login,
        signup,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
