import React from 'react';
import { Link } from 'react-router-dom';
import { LogoMark, ArrowLeftIcon } from '../components/icons';

export const TermsPage: React.FC = () => (
  <div className="min-h-dvh bg-brand-bg">
    <header className="border-b border-brand-border">
      <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-2">
          <LogoMark className="w-6 h-6 text-brand-primary" />
          <span className="text-sm font-semibold text-brand-text">BrandCore</span>
        </Link>
        <Link to="/" className="text-sm text-brand-muted hover:text-brand-text inline-flex items-center gap-1.5 transition-colors">
          <ArrowLeftIcon className="w-4 h-4" />
          Back
        </Link>
      </div>
    </header>

    <main className="max-w-3xl mx-auto px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-wide text-brand-muted">Legal</p>
      <h1 className="font-display text-4xl tracking-tighter text-brand-text mt-2">Terms of service</h1>
      <p className="text-sm text-brand-faint mt-2">Last updated August 2026</p>

      <div className="mt-10 space-y-8 text-sm text-brand-text/85 leading-relaxed max-w-[65ch]">
        <section>
          <h2 className="font-semibold text-brand-text text-base mb-2">Acceptable use</h2>
          <p>
            Only scan websites you own or have permission to crawl. The crawler respects robots.txt and
            rate-limits per domain; do not use it to bypass access controls on third-party sites.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-brand-text text-base mb-2">Usage tiers and limits</h2>
          <p>
            Each account has a monthly token and cost ceiling based on its tier. Requests beyond that
            ceiling are rejected until the next billing cycle or a tier upgrade.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-brand-text text-base mb-2">Generated content</h2>
          <p>
            You own the campaign copy generated from your own brand profile. We make no claim over it.
            Review AI-generated copy before publishing — it is a draft, not a final approved asset.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-brand-text text-base mb-2">Availability</h2>
          <p>
            This is an early-stage workspace under active development. Features may change, and we do
            not currently guarantee uptime SLAs.
          </p>
        </section>
      </div>
    </main>
  </div>
);
