import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('brandcore-email-service');

export interface SentEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  sentAt: number;
}

/**
 * In-memory record of every email this process has sent/would-have-sent -
 * lets tests assert on verification/reset emails without a real inbox, and
 * gives dev/local runs (no RESEND_API_KEY) a way to grab the link without
 * scrolling logs. Bounded so a long-running process can't leak memory over
 * time; only the most recent emails matter for either use case.
 */
export const sentEmailsOutbox: SentEmail[] = [];
const OUTBOX_MAX_SIZE = 200;

export function clearSentEmailsOutbox(): void {
  sentEmailsOutbox.length = 0;
}

/**
 * Sends a transactional email via Resend's HTTP API (free tier covers this
 * use case) - a plain `fetch` call rather than the `resend` npm package, to
 * avoid adding a dependency for what's a single POST request.
 *
 * Zero-cost by default: with no RESEND_API_KEY configured (the out-of-the-box
 * state - see .env.example), this logs the email instead of sending it and
 * still records it in sentEmailsOutbox, so verification/password-reset flows
 * are fully usable and testable in dev without signing up for anything.
 *
 * Never throws - a failed/unconfigured send degrades to a logged email
 * rather than failing whatever triggered it (registration, a password-reset
 * request). Callers that need to know whether a real send succeeded can
 * inspect the return value.
 */
export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<{ delivered: boolean }> {
  return tracer.startActiveSpan('send_email', async (span) => {
    span.setAttribute('email.to', to);
    span.setAttribute('email.subject', subject);

    const apiKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.EMAIL_FROM || 'BrandCore <onboarding@resend.dev>';

    if (sentEmailsOutbox.length >= OUTBOX_MAX_SIZE) {
      sentEmailsOutbox.shift();
    }

    if (!apiKey) {
      console.log(`[Email] No RESEND_API_KEY configured - logging instead of sending.\nTo: ${to}\nSubject: ${subject}\n\n${text}`);
      sentEmailsOutbox.push({ to, subject, html, text, sentAt: Date.now() });
      span.setAttribute('email.delivered', false);
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return { delivered: false };
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromAddress, to: [to], subject, html, text }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Resend API error ${res.status}: ${body}`);
      }
      sentEmailsOutbox.push({ to, subject, html, text, sentAt: Date.now() });
      span.setAttribute('email.delivered', true);
      span.setStatus({ code: SpanStatusCode.OK });
      return { delivered: true };
    } catch (err: any) {
      console.error('[Email] Failed to send:', err.message);
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      return { delivered: false };
    } finally {
      span.end();
    }
  });
}
