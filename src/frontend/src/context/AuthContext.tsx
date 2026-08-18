import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AuthSession, loginUser, loginWithGoogle, logoutSession, refreshSession, registerUser } from '../api/auth';
import { isTokenExpired } from '../lib/jwt';
import { clearStoredSession, getRefreshToken, readStoredSession, writeStoredSession } from '../lib/session';

export interface AuthUser {
  userId: string;
  email: string;
  role: string;
  emailVerified: boolean;
}

export interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  loginWithGoogleToken: (googleAccessToken: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sessionEpoch = useRef(0);

  const applySession = useCallback((session: AuthSession) => {
    sessionEpoch.current += 1;
    writeStoredSession(session);
    setUser(session.user);
  }, []);

  const logout = useCallback(async () => {
    sessionEpoch.current += 1;
    const refreshToken = getRefreshToken();
    clearStoredSession();
    setUser(null);
    setError(null);
    // Revoke server-side so the refresh token can't be replayed after logout.
    // Fire-and-forget from the caller's perspective (local sign-out already happened).
    if (refreshToken) {
      void logoutSession(refreshToken);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const epochAtStart = sessionEpoch.current;

    async function hydrateSession() {
      const stored = readStoredSession();
      if (!stored) {
        if (!cancelled) setIsLoading(false);
        return;
      }

      if (!isTokenExpired(stored.accessToken)) {
        if (!cancelled && sessionEpoch.current === epochAtStart) {
          setUser(stored.user);
        }
        if (!cancelled) setIsLoading(false);
        return;
      }

      const refreshTokenUsed = stored.refreshToken;

      try {
        const session = await refreshSession(refreshTokenUsed);
        if (!cancelled && sessionEpoch.current === epochAtStart) {
          applySession(session);
        }
      } catch {
        const current = readStoredSession();
        if (
          !cancelled &&
          sessionEpoch.current === epochAtStart &&
          current?.refreshToken === refreshTokenUsed
        ) {
          clearStoredSession();
          setUser(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    hydrateSession();
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const session = await loginUser(email, password);
      applySession(session);
    },
    [applySession]
  );

  const signup = useCallback(
    async (email: string, password: string) => {
      setError(null);
      let res: any;
      try {
        res = await registerUser(email, password);
      } catch (err) {
        if (err instanceof Error && err.message === 'Email already registered') {
          throw new Error('This email is already registered. Sign in with your existing password.');
        }
        throw err;
      }
      if (res?.accessToken && res?.refreshToken && res?.user) {
        applySession({
          accessToken: res.accessToken,
          refreshToken: res.refreshToken,
          user: res.user,
        });
      } else {
        const session = await loginUser(email, password);
        applySession(session);
      }
    },
    [applySession]
  );

  const loginWithGoogleToken = useCallback(
    async (googleAccessToken: string) => {
      setError(null);
      const session = await loginWithGoogle(googleAccessToken);
      applySession(session);
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
        loginWithGoogleToken,
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
