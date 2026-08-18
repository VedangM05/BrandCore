import React, { useState } from 'react';
import { forgotPassword } from '../api/auth';
import { AuthLayout, AuthLink } from '../components/auth/AuthLayout';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await forgotPassword(email.trim());
      // Always shows the same success state regardless of whether the email
      // exists - matches the backend's identical-response contract
      // (requestPasswordReset in auth.service.ts), so this page can't be
      // used to probe which emails have accounts.
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your account email and we'll send you a link to reset your password."
      footer={<AuthLink to="/login">Back to sign in</AuthLink>}
    >
      {sent ? (
        <div role="status" className="rounded-md bg-brand-sunken border border-brand-border text-sm px-4 py-3 text-brand-text">
          If an account exists for <strong>{email.trim()}</strong>, a reset link is on its way. Check your inbox (and spam
          folder).
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && (
            <div role="alert" className="rounded-md bg-state-danger border border-[#F3C6C6] text-state-danger-text text-sm px-4 py-3">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="forgot-email" className="block text-sm font-medium text-brand-text mb-1.5">
              Email
            </label>
            <input
              id="forgot-email"
              data-testid="forgot-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="input-field"
            />
          </div>
          <button type="submit" disabled={submitting} className="btn-primary w-full py-3" data-testid="forgot-submit">
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
};
