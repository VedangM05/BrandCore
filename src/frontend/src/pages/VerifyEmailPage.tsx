import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { verifyEmail } from '../api/auth';
import { AuthLayout, AuthLink } from '../components/auth/AuthLayout';
import { usePageMeta } from '../lib/pageMeta';

type VerifyState = 'verifying' | 'success' | 'error';

export const VerifyEmailPage: React.FC = () => {
  usePageMeta('Verify your email — BrandCore', 'Verify your email address to finish setting up your BrandCore account.');
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [state, setState] = useState<VerifyState>(token ? 'verifying' : 'error');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    verifyEmail(token)
      .then(() => {
        if (!cancelled) setState('success');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === 'verifying') {
    return (
      <AuthLayout title="Verifying your email" subtitle="One moment…" footer={<AuthLink to="/login">Back to sign in</AuthLink>}>
        <div role="status" className="text-sm text-brand-muted px-1 py-2">
          Confirming your verification link…
        </div>
      </AuthLayout>
    );
  }

  if (state === 'success') {
    return (
      <AuthLayout title="Email verified" subtitle="Your account is fully set up." footer={<AuthLink to="/login">Continue to sign in</AuthLink>}>
        <div role="status" className="rounded-md bg-brand-sunken border border-brand-border text-sm px-4 py-3 text-brand-text">
          Your email address has been verified.
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Verification link invalid" subtitle="This link may be expired or already used." footer={<AuthLink to="/login">Back to sign in</AuthLink>}>
      <div role="alert" className="rounded-md bg-state-danger border border-[#F3C6C6] text-state-danger-text text-sm px-4 py-3">
        This verification link is invalid or has expired. Sign in and use the "resend verification email" option to get a
        new one.
      </div>
    </AuthLayout>
  );
};
