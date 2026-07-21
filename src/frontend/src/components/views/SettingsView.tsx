import React from 'react';

const SECTIONS = [
  {
    title: 'Brand defaults',
    description: 'Set default export formats, aspect ratios, and tone preferences for new campaigns.',
  },
  {
    title: 'Team & permissions',
    description: 'Invite collaborators and control who can edit brand profiles and publish assets.',
  },
  {
    title: 'Integrations',
    description: 'Connect social platforms and export destinations to push creatives directly.',
  },
  {
    title: 'Notifications',
    description: 'Choose when to receive alerts for campaign reviews, renders, and export completions.',
  },
];

export const SettingsView: React.FC = () => (
  <div className="space-y-8 max-w-3xl">
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Configuration</p>
      <h2 className="text-2xl font-bold text-brand-text mt-1">Settings</h2>
      <p className="text-sm text-brand-muted mt-1">Manage workspace preferences and integrations.</p>
    </div>

    <div className="space-y-3">
      {SECTIONS.map((section) => (
        <section key={section.title} className="panel p-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-brand-text">{section.title}</h3>
            <p className="text-xs text-brand-muted mt-1 leading-relaxed max-w-lg">{section.description}</p>
          </div>
          <button type="button" className="btn-secondary py-2 text-xs shrink-0">
            Configure
          </button>
        </section>
      ))}
    </div>
  </div>
);
