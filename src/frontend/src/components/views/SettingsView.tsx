import React, { useState } from 'react';

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
    <div className="space-y-8 max-w-4xl">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Configuration</p>
        <h2 className="text-2xl font-bold text-white mt-1">Workspace Settings</h2>
        <p className="text-sm text-slate-400 mt-1">
          Manage workspace defaults, AI provider integrations, export behaviors, and team notifications.
        </p>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Brand & AI Defaults Section */}
        <section className="panel p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-bold text-white">Brand & AI Defaults</h3>
              <p className="text-xs text-slate-400 mt-0.5">Configure default generation presets for campaigns.</p>
            </div>
            <span className="tag bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Preset</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-2">Default Aspect Ratio</label>
              <select
                value={defaultAspect}
                onChange={(e) => setDefaultAspect(e.target.value)}
                className="input-field"
              >
                <option value="1:1">1:1 Square (Social Feed)</option>
                <option value="16:9">16:9 Widescreen (Banner / Web)</option>
                <option value="9:16">9:16 Vertical (Stories / Reels)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-2">Default Brand Tone</label>
              <input
                type="text"
                value={defaultTone}
                onChange={(e) => setDefaultTone(e.target.value)}
                className="input-field"
              />
            </div>
          </div>
        </section>

        {/* AI Provider Status */}
        <section className="panel p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-bold text-white">AI Provider Integrations</h3>
              <p className="text-xs text-slate-400 mt-0.5">Gemini 2.5 Flash API Key and LangGraph Agent Engine status.</p>
            </div>
            <span className="tag bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Active
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-bold text-white">Google Gemini API Key</p>
              <p className="text-xs text-slate-400 font-mono">GEMINI_API_KEY &middot; Set in environment (`.env`)</p>
            </div>
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/20">
              Connected
            </span>
          </div>
        </section>

        {/* Notifications & Export Behaviors */}
        <section className="panel p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-bold text-white">Notifications & Delivery</h3>
              <p className="text-xs text-slate-400 mt-0.5">Control export delivery alerts and background task notifications.</p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer">
              <div>
                <p className="text-sm font-semibold text-white">Auto-persist Generated Renders</p>
                <p className="text-xs text-slate-400">Automatically save AI Photoshoot renders to Asset Library</p>
              </div>
              <input
                type="checkbox"
                checked={autoExport}
                onChange={(e) => setAutoExport(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-700 bg-slate-800"
              />
            </label>

            <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer">
              <div>
                <p className="text-sm font-semibold text-white">Campaign Email Digest</p>
                <p className="text-xs text-slate-400">Receive summary reports when multi-agent QA approvals complete</p>
              </div>
              <input
                type="checkbox"
                checked={emailAlerts}
                onChange={(e) => setEmailAlerts(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-700 bg-slate-800"
              />
            </label>
          </div>
        </section>

        <div className="flex items-center justify-between pt-2">
          <button type="submit" className="btn-primary px-6 py-2.5 text-xs">
            Save Workspace Settings
          </button>
          {savedSuccess && (
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
              ✓ Settings saved successfully!
            </span>
          )}
        </div>
      </form>
    </div>
  );
};
