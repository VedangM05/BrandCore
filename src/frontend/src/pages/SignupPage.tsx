import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AuthLayout, AuthLink } from '../components/auth/AuthLayout';

export const SignupPage: React.FC = () => {
  const { signup, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

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
      subtitle="Register to start building campaigns with your brand profile."
      footer={
        <>
          Already have an account? <AuthLink to="/login">Sign in</AuthLink>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
            {error}
            {error.includes('already registered') && (
              <p className="mt-2">
                <AuthLink to="/login">Go to sign in</AuthLink>
              </p>
            )}
          </div>
        )}

        <div>
          <label htmlFor="signup-email" className="block text-sm font-semibold text-brand-text mb-1.5">
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
          <label htmlFor="signup-password" className="block text-sm font-semibold text-brand-text mb-1.5">
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
          <label htmlFor="signup-confirm" className="block text-sm font-semibold text-brand-text mb-1.5">
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
          {submitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  );
};
