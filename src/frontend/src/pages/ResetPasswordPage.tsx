import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../api/auth';
import { AuthLayout, AuthLink } from '../components/auth/AuthLayout';

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

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
      await resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout title="Invalid link" subtitle="This password reset link is missing its token." footer={<AuthLink to="/forgot-password">Request a new link</AuthLink>}>
        <div role="alert" className="rounded-md bg-state-danger border border-[#F3C6C6] text-state-danger-text text-sm px-4 py-3">
          This link looks incomplete. Request a new password reset email and try again.
        </div>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Password updated" subtitle="You can now sign in with your new password." footer={<AuthLink to="/login">Sign in</AuthLink>}>
        <div role="status" className="rounded-md bg-brand-sunken border border-brand-border text-sm px-4 py-3 text-brand-text">
          Your password was reset successfully. Redirecting you to sign in…
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Set a new password" subtitle="Choose a new password for your account." footer={<AuthLink to="/login">Back to sign in</AuthLink>}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="rounded-md bg-state-danger border border-[#F3C6C6] text-state-danger-text text-sm px-4 py-3">
            {error}
            {error.includes('Invalid or expired') && (
              <p className="mt-2">
                <AuthLink to="/forgot-password">Request a new link</AuthLink>
              </p>
            )}
          </div>
        )}

        <div>
          <label htmlFor="reset-password" className="block text-sm font-medium text-brand-text mb-1.5">
            New password
          </label>
          <input
            id="reset-password"
            data-testid="reset-password"
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
          <label htmlFor="reset-confirm" className="block text-sm font-medium text-brand-text mb-1.5">
            Confirm new password
          </label>
          <input
            id="reset-confirm"
            data-testid="reset-confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your new password"
            className="input-field"
          />
        </div>

        <button type="submit" disabled={submitting} className="btn-primary w-full py-3" data-testid="reset-submit">
          {submitting ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    </AuthLayout>
  );
};
