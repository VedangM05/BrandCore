import React from 'react';

export const BriefWriterView: React.FC = () => (
  <div className="space-y-8">
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Copy studio</p>
      <h2 className="text-2xl font-bold text-brand-text mt-1">Campaign Ad Copy Planner</h2>
      <p className="text-sm text-brand-muted mt-1 max-w-2xl">
        Draft channel-specific messaging that stays aligned with your brand voice profile.
      </p>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <article className="panel p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="tag bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20">Ad headline</span>
          <button type="button" className="text-xs font-semibold text-brand-primary hover:underline">
            Regenerate
          </button>
        </div>
        <h3 className="text-xl font-bold text-brand-text leading-snug">Introducing Your Summer Collection</h3>
        <p className="text-sm text-brand-muted leading-relaxed">
          Discover fresh styles crafted for the season. Limited-edition pieces designed to reflect your brand&apos;s
          unique identity and connect with your audience.
        </p>
        <div className="pt-2 flex gap-2">
          <button type="button" className="btn-secondary py-2 text-xs">
            Copy
          </button>
          <button type="button" className="btn-primary py-2 text-xs">
            Use in campaign
          </button>
        </div>
      </article>

      <article className="panel p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="tag bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20">Twitter/X</span>
          <span className="text-xs text-brand-muted">142 / 280 chars</span>
        </div>
        <p className="text-sm text-brand-text leading-relaxed font-medium">
          &ldquo;Summer is here and so is our new collection. Shop the looks your customers have been waiting
          for.&rdquo;
        </p>
        <div className="rounded-xl bg-brand-elevated border border-brand-border p-4">
          <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2">Also generate for</p>
          <div className="flex flex-wrap gap-2">
            {['LinkedIn', 'Email subject', 'Meta ad'].map((channel) => (
              <button
                key={channel}
                type="button"
                className="px-3 py-1.5 rounded-lg bg-white border border-brand-border text-xs font-semibold text-brand-muted hover:text-brand-text hover:border-brand-primary/30 transition-colors"
              >
                {channel}
              </button>
            ))}
          </div>
        </div>
      </article>
    </div>
  </div>
);
