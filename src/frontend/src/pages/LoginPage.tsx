import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AuthLayout, AuthLink } from '../components/auth/AuthLayout';
import { GoogleAuthButton, isGoogleAuthConfigured } from '../components/auth/GoogleAuthButton';

const DEMO_ACCOUNTS = [
  { email: 'vedang@brandcore.com', password: 'password123', label: 'vedang@brandcore.com' },
  { email: 'admin@brandcore.com', password: 'password123', label: 'admin@brandcore.com' },
];

export const LoginPage: React.FC = () => {
  const { login, loginWithGoogleToken, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(email.trim(), password);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSuccess = async (accessToken: string) => {
    setError(null);
    setSubmitting(true);
    try {
      await loginWithGoogleToken(accessToken);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoSignIn = async (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError(null);
    setSubmitting(true);

    try {
      await login(demoEmail, demoPassword);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Enter your credentials to access your workspace."
      footer={
        <>
          Don&apos;t have an account? <AuthLink to="/signup">Create one</AuthLink>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="rounded-md bg-state-danger border border-[#F3C6C6] text-state-danger-text text-sm px-4 py-3 space-y-2">
            <p className="font-medium">{error}</p>
            {error.includes('Invalid email or password') && (
              <div className="text-xs space-y-1.5 pt-0.5">
                <p className="opacity-90">Double-check your credentials, or register this email instead.</p>
                <button
                  type="button"
                  onClick={() => navigate('/signup')}
                  className="font-semibold underline underline-offset-2 hover:opacity-70 transition-opacity"
                >
                  Create account with this email
                </button>
              </div>
            )}
          </div>
        )}

        {isGoogleAuthConfigured() && (
          <>
            <GoogleAuthButton onSuccess={handleGoogleSuccess} onError={setError} disabled={submitting} />
            <div className="flex items-center gap-3 text-xs text-brand-muted">
              <span className="flex-1 h-px bg-brand-border" />
              or continue with email
              <span className="flex-1 h-px bg-brand-border" />
            </div>
          </>
        )}

        <div>
          <label htmlFor="login-email" className="block text-sm font-medium text-brand-text mb-1.5">
            Email
          </label>
          <input
            id="login-email"
            data-testid="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="input-field"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="login-password" className="block text-sm font-medium text-brand-text">
              Password
            </label>
            <AuthLink to="/forgot-password">Forgot password?</AuthLink>
          </div>
          <input
            id="login-password"
            data-testid="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            className="input-field"
          />
        </div>

        <button type="submit" disabled={submitting} className="btn-primary w-full py-3" data-testid="login-submit">
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="pt-3 border-t border-brand-border text-center">
          <p className="text-xs text-brand-muted mb-2.5">Demo accounts &middot; password: password123</p>
          <div className="flex flex-wrap justify-center gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => handleDemoSignIn(account.email, account.password)}
                disabled={submitting}
                className="px-2.5 py-1 rounded bg-brand-sunken border border-brand-border text-[11px] font-medium text-brand-muted hover:text-brand-text hover:border-brand-border-strong transition-colors disabled:opacity-50"
              >
                {account.label}
              </button>
            ))}
          </div>
        </div>
      </form>
    </AuthLayout>
  );
};
