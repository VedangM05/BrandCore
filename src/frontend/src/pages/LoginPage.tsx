import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AuthLayout, AuthLink } from '../components/auth/AuthLayout';

export const LoginPage: React.FC = () => {
  const { login, isAuthenticated, isLoading } = useAuth();
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
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemoAccount = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('password123');
    setError(null);
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back. Enter your credentials to access your workspace."
      footer={
        <>
          Don&apos;t have an account? <AuthLink to="/signup">Create one</AuthLink>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 space-y-1">
            <p className="font-semibold">{error}</p>
            <p className="text-xs text-red-600">
              Account not found or password incorrect. You can <AuthLink to="/signup">create an account</AuthLink> or use demo credentials below.
            </p>
          </div>
        )}

        <div>
          <label htmlFor="login-email" className="block text-sm font-semibold text-brand-text mb-1.5">
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
          <label htmlFor="login-password" className="block text-sm font-semibold text-brand-text mb-1.5">
            Password
          </label>
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
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>

        <div className="pt-2 border-t border-slate-200 text-center">
          <p className="text-xs text-slate-500 mb-2 font-medium">Quick Demo Accounts</p>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={() => fillDemoAccount('vedang@brandcore.com')}
              className="px-2.5 py-1 rounded-md bg-indigo-50 border border-indigo-200 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
            >
              vedang@brandcore.com
            </button>
            <button
              type="button"
              onClick={() => fillDemoAccount('admin@brandcore.com')}
              className="px-2.5 py-1 rounded-md bg-slate-100 border border-slate-300 text-[11px] font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
            >
              admin@brandcore.com
            </button>
          </div>
        </div>
      </form>
    </AuthLayout>
  );
};
