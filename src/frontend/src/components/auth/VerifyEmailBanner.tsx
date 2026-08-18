import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { resendVerificationEmail } from '../../api/client';

/**
 * Soft nudge, not a hard gate - unverified users can already use the whole
 * app (see the "Login is not blocked by an unverified email" decision in
 * auth.service.ts/emailVerification.test.ts). This just surfaces the state
 * and gives a one-click way to get another link, rather than making
 * verification a blocker to using the product.
 */
export const VerifyEmailBanner: React.FC = () => {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  if (!user || user.emailVerified || dismissed) return null;

  const handleResend = async () => {
    setStatus('sending');
    try {
      await resendVerificationEmail();
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div
      role="status"
      className="bg-brand-sunken border-b border-brand-border text-brand-text px-6 py-2.5 text-sm shrink-0 flex items-center justify-between gap-4"
    >
      <span>
        Verify your email ({user.email}) to secure your account.
        {status === 'sent' && ' A new link is on its way - check your inbox.'}
        {status === 'error' && ' Something went wrong sending that - try again in a moment.'}
      </span>
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={handleResend}
          disabled={status === 'sending' || status === 'sent'}
          className="font-medium text-brand-primary hover:text-brand-primary-hover transition-colors disabled:opacity-50"
          data-testid="resend-verification-button"
        >
          {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Sent' : 'Resend email'}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-brand-muted hover:text-brand-text transition-colors"
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};
