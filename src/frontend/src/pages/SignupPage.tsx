import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AuthLayout, AuthLink } from '../components/auth/AuthLayout';
import { GoogleAuthButton, isGoogleAuthConfigured } from '../components/auth/GoogleAuthButton';
import { usePageMeta } from '../lib/pageMeta';

export const SignupPage: React.FC = () => {
  usePageMeta('Create your account — BrandCore', 'Create a free BrandCore account to scan a website and generate on-brand campaigns from it.');
  const { signup, loginWithGoogleToken, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleGoogleSuccess = async (accessToken: string) => {
    setError(null);
    setSubmitting(true);
    try {
      await loginWithGoogleToken(accessToken);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google sign-up failed';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);

    try {
      await signup(email.trim(), password);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create account"
      subtitle="Register to start building campaigns from your brand profile."
      footer={
        <>
          Already have an account? <AuthLink to="/login">Sign in</AuthLink>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="rounded-md bg-state-danger border border-[#F3C6C6] text-state-danger-text text-sm px-4 py-3">
            {error}
            {error.includes('already registered') && (
              <p className="mt-2">
                <AuthLink to="/login">Go to sign in</AuthLink>
              </p>
            )}
          </div>
        )}

        {isGoogleAuthConfigured() && (
          <>
            <GoogleAuthButton label="Sign up with Google" onSuccess={handleGoogleSuccess} onError={setError} disabled={submitting} />
            <div className="flex items-center gap-3 text-xs text-brand-muted">
              <span className="flex-1 h-px bg-brand-border" />
              or continue with email
              <span className="flex-1 h-px bg-brand-border" />
            </div>
          </>
        )}

        <div>
          <label htmlFor="signup-email" className="block text-sm font-medium text-brand-text mb-1.5">
            Email
          </label>
          <input
            id="signup-email"
            data-testid="signup-email"
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
          <label htmlFor="signup-password" className="block text-sm font-medium text-brand-text mb-1.5">
            Password
          </label>
          <input
            id="signup-password"
            data-testid="signup-password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="input-field"
          />
        </div>

        <div>
          <label htmlFor="signup-confirm" className="block text-sm font-medium text-brand-text mb-1.5">
            Confirm password
          </label>
          <input
            id="signup-confirm"
            data-testid="signup-confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password"
            className="input-field"
          />
        </div>

        <button type="submit" disabled={submitting} className="btn-primary w-full py-3" data-testid="signup-submit">
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  );
};
