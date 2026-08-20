/**
 * Privacy-friendly, cookie-free analytics (Plausible-compatible script tag)
 * - a no-op unless VITE_ANALYTICS_DOMAIN is actually set, since there's no
 * real analytics account to connect this project to right now. Deliberately
 * NOT Google Analytics: GA sets tracking cookies and would need a real
 * cookie-consent banner (GDPR) - a script-tag analytics provider that
 * doesn't use cookies (Plausible, Simple Analytics, Fathom all qualify)
 * avoids needing that entirely, so this app doesn't carry consent-banner
 * complexity for a feature that isn't even turned on.
 *
 * To actually enable: sign up with a privacy-friendly provider, set
 * VITE_ANALYTICS_DOMAIN (your site's registered domain there) and, if not
 * using Plausible's own cloud, VITE_ANALYTICS_SCRIPT_SRC. Nothing loads or
 * runs without VITE_ANALYTICS_DOMAIN set.
 *
 * Reads via define-injected globals (see vite.config.ts), not
 * import.meta.env - this repo's tsconfig targets CommonJS for tsc/ts-jest,
 * which rejects import.meta syntax outright (TS1343), same reason
 * GoogleAuthButton.tsx does it this way.
 */
export function initAnalytics(): void {
  const domain = typeof __ANALYTICS_DOMAIN__ !== 'undefined' ? __ANALYTICS_DOMAIN__ : '';
  if (!domain) return;

  const scriptSrc = (typeof __ANALYTICS_SCRIPT_SRC__ !== 'undefined' && __ANALYTICS_SCRIPT_SRC__) || 'https://plausible.io/js/script.js';
  const script = document.createElement('script');
  script.defer = true;
  script.setAttribute('data-domain', domain);
  script.src = scriptSrc;
  document.head.appendChild(script);
}
