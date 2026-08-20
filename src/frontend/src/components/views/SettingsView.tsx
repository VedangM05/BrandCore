import React, { useState } from 'react';
import { CheckIcon } from '../icons';

export const SettingsView: React.FC = () => {
  const [defaultAspect, setDefaultAspect] = useState('1:1');
  const [defaultTone, setDefaultTone] = useState('Modern, Professional, and Innovative');
  const [autoExport, setAutoExport] = useState(true);
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-brand-muted">Configuration</p>
        <h2 className="font-display text-3xl tracking-tighter text-brand-text mt-1">Workspace settings</h2>
        <p className="text-sm text-brand-muted mt-1.5 leading-relaxed">
          Defaults for generation, integrations, and notifications.
        </p>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-5">
        <section className="panel p-6 space-y-4">
          <div className="border-b border-brand-border pb-3">
            <h3 className="text-sm font-semibold text-brand-text">Generation defaults</h3>
            <p className="text-xs text-brand-muted mt-0.5">Applied as a starting point for new campaigns.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="default-aspect" className="text-xs font-medium text-brand-muted block mb-1.5">
                Default aspect ratio
              </label>
              <select
                id="default-aspect"
                value={defaultAspect}
                onChange={(e) => setDefaultAspect(e.target.value)}
                className="input-field"
              >
                <option value="1:1">1:1 square (social feed)</option>
                <option value="16:9">16:9 widescreen (banner)</option>
                <option value="9:16">9:16 vertical (stories)</option>
              </select>
            </div>

            <div>
              <label htmlFor="default-tone" className="text-xs font-medium text-brand-muted block mb-1.5">
                Default brand tone
              </label>
              <input
                id="default-tone"
                type="text"
                value={defaultTone}
                onChange={(e) => setDefaultTone(e.target.value)}
                className="input-field"
              />
            </div>
          </div>
        </section>

        <section className="panel p-6 space-y-4">
          <div className="border-b border-brand-border pb-3">
            <h3 className="text-sm font-semibold text-brand-text">Notifications</h3>
            <p className="text-xs text-brand-muted mt-0.5">Delivery and background task alerts.</p>
          </div>

          <div className="space-y-2.5">
            <label className="flex items-center justify-between p-3.5 rounded-md bg-brand-sunken border border-brand-border cursor-pointer">
              <div>
                <p className="text-sm font-medium text-brand-text">Auto-persist generated renders</p>
                <p className="text-xs text-brand-muted mt-0.5">Save AI Photoshoot renders to the asset library automatically</p>
              </div>
              <input
                type="checkbox"
                checked={autoExport}
                onChange={(e) => setAutoExport(e.target.checked)}
                className="w-4 h-4 rounded text-brand-primary focus:ring-brand-primary border-brand-border-strong bg-white"
              />
            </label>

            <label className="flex items-center justify-between p-3.5 rounded-md bg-brand-sunken border border-brand-border cursor-pointer">
              <div>
                <p className="text-sm font-medium text-brand-text">Campaign email digest</p>
                <p className="text-xs text-brand-muted mt-0.5">Summary when a multi-agent QA approval completes</p>
              </div>
              <input
                type="checkbox"
                checked={emailAlerts}
                onChange={(e) => setEmailAlerts(e.target.checked)}
                className="w-4 h-4 rounded text-brand-primary focus:ring-brand-primary border-brand-border-strong bg-white"
              />
            </label>
          </div>
        </section>

        <div className="flex items-center gap-3 pt-1">
          <button type="submit" className="btn-primary px-6 py-2.5 text-xs">
            Save settings
          </button>
          {savedSuccess && (
            <span className="text-xs font-medium text-state-success-text bg-state-success px-3 py-1.5 rounded-md inline-flex items-center gap-1.5">
              <CheckIcon className="w-3.5 h-3.5" />
              Settings saved
            </span>
          )}
        </div>
      </form>
    </div>
  );
};
