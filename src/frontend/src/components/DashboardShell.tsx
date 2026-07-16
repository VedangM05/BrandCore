import React, { useEffect, useState } from 'react';
import { useProject } from '../context/ProjectContext';
import { traceLayoutMount } from '../telemetry';

export const DashboardShell: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { projects, activeProject, selectProject, error } = useProject();
  const [mountTime, setMountTime] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // Business DNA State
  const [websiteUrl, setWebsiteUrl] = useState<string>('');
  const [isScanningDna, setIsScanningDna] = useState<boolean>(false);
  const [dnaResults, setDnaResults] = useState<any | null>(null);

  // Photoshoot State
  const [photoshootStyle, setPhotoshootStyle] = useState<string>('Studio');
  const [scenePrompt, setScenePrompt] = useState<string>('');
  const [isGeneratingPhoto, setIsGeneratingPhoto] = useState<boolean>(false);
  const [generatedPhoto, setGeneratedPhoto] = useState<string | null>(null);

  // Campaign State
  const [campaignType, setCampaignType] = useState<string>('launch');
  const [campaignCopy, setCampaignCopy] = useState<any | null>(null);

  const start = performance.now();

  useEffect(() => {
    const duration = performance.now() - start;
    setMountTime(duration);

    if (duration > 150) {
      console.warn(`[DashboardShell] Mount latency exceeded SLA target: ${duration.toFixed(2)}ms`);
    }

    traceLayoutMount('DashboardShell', start);
  }, []);

  // Simulate Business DNA Scan
  const handleDnaScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!websiteUrl) return;
    setIsScanningDna(true);
    setDnaResults(null);
    setTimeout(() => {
      setIsScanningDna(false);
      setDnaResults({
        brandName: websiteUrl.replace(/https?:\/\/(www\.)?/, '').split('.')[0].toUpperCase(),
        colors: ['#3B82F6', '#10B981', '#6366F1', '#F59E0B'],
        tone: 'Modern, Professional, and Innovative',
        font: 'Outfit & Inter'
      });
    }, 1000);
  };

  // Simulate AI Photoshoot Generation
  const handlePhotoGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    setIsGeneratingPhoto(true);
    setGeneratedPhoto(null);
    setTimeout(() => {
      setIsGeneratingPhoto(false);
      setGeneratedPhoto(
        `Generated a high-fidelity image using the "${photoshootStyle}" theme based on prompt: "${scenePrompt || 'Minimalist studio setup'}"`
      );
    }, 1200);
  };

  // Simulate Campaign Copy Generator
  const handleCampaignGenerate = () => {
    if (campaignType === 'launch') {
      setCampaignCopy({
        headline: 'Introducing BrandCore Analytics v2',
        body: 'Unlock deep visual and trace insights across your user flows with real-time OpenTelemetry. Experience zero latency.',
        social: 'The future of analytics is trace-driven. Optimize your system performance to the sub-millisecond with BrandCore.'
      });
    } else if (campaignType === 'sale') {
      setCampaignCopy({
        headline: 'Level Up Your Infrastructure - 40% Off',
        body: 'Get premium multi-tenant dashboard layout templates and database metrics connectors at our special seasonal discount.',
        social: 'Accelerate your development cycle. Subscribe to BrandCore Systems today at 40% off. Limited slots!'
      });
    } else {
      setCampaignCopy({
        headline: 'Core Performance You Can Trust',
        body: 'Calibrated Argon2id password hashing and single-use JWT refresh token rotation ensure security is never a trade-off.',
        social: 'Security built into layout boundaries. Elevate your brand trust with zero-trust token lineage verification.'
      });
    }
  };

  return (
    <div className="flex h-screen bg-brand-bg text-brand-text font-sans overflow-hidden">
      {/* Sidebar Workspace Navigator */}
      <aside className="w-64 bg-brand-card border-r border-brand-border flex flex-col justify-between" aria-label="Sidebar Navigation">
        <div>
          {/* Logo Zone */}
          <div className="h-16 flex items-center px-6 border-b border-brand-border">
            <span className="text-xl font-bold tracking-wider text-brand-accent bg-blue-900/20 px-3 py-1 rounded">
              BrandCore
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-2" aria-label="Sidebar Navigation">
            <a
              href="#dashboard"
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-150 ${
                activeTab === 'dashboard'
                  ? 'bg-blue-600/10 text-brand-accent border-l-4 border-brand-accent'
                  : 'text-brand-muted hover:text-brand-text hover:bg-slate-800/40'
              }`}
            >
              <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Dashboard
            </a>
            <a
              href="#dna"
              onClick={() => setActiveTab('dna')}
              className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-150 ${
                activeTab === 'dna'
                  ? 'bg-blue-600/10 text-brand-accent border-l-4 border-brand-accent'
                  : 'text-brand-muted hover:text-brand-text hover:bg-slate-800/40'
              }`}
            >
              <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2m0 0v-2m0 2v2m0-5V7m0 10v1m-7-1h2m-2 0V9a2 2 0 012-2h4a2 2 0 012 2v2M5 11v6a2 2 0 002 2h10a2 2 0 002-2v-6m-2-2V7a2 2 0 00-2-2H9a2 2 0 00-2 2v2m10 0H7" />
              </svg>
              Business DNA
            </a>
            <a
              href="#photoshoot"
              onClick={() => setActiveTab('photoshoot')}
              className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-150 ${
                activeTab === 'photoshoot'
                  ? 'bg-blue-600/10 text-brand-accent border-l-4 border-brand-accent'
                  : 'text-brand-muted hover:text-brand-text hover:bg-slate-800/40'
              }`}
            >
              <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              AI Photoshoot
            </a>
            <a
              href="#campaigns"
              onClick={() => setActiveTab('campaigns')}
              className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-150 ${
                activeTab === 'campaigns'
                  ? 'bg-blue-600/10 text-brand-accent border-l-4 border-brand-accent'
                  : 'text-brand-muted hover:text-brand-text hover:bg-slate-800/40'
              }`}
            >
              <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Campaign Creator
            </a>
            <a
              href="#settings"
              onClick={() => setActiveTab('settings')}
              className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-150 ${
                activeTab === 'settings'
                  ? 'bg-blue-600/10 text-brand-accent border-l-4 border-brand-accent'
                  : 'text-brand-muted hover:text-brand-text hover:bg-slate-800/40'
              }`}
            >
              <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </a>
          </nav>
        </div>

        {/* Telemetry Status Details */}
        <div className="p-4 border-t border-brand-border bg-black/20 text-xs space-y-1">
          <div className="flex justify-between text-brand-muted">
            <span>Mount Latency:</span>
            <span className="font-semibold text-brand-accent" data-testid="mount-latency-display">
              {mountTime.toFixed(1)} ms
            </span>
          </div>
          <div className="flex justify-between text-brand-muted">
            <span>Telemetry:</span>
            <span className="text-emerald-500 font-semibold">Active</span>
          </div>
        </div>
      </aside>

      {/* Main Layout Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-brand-card border-b border-brand-border flex items-center justify-between px-6 z-10">
          <div className="flex items-center space-x-4">
            <label htmlFor="workspace-select" className="text-sm font-medium text-brand-muted">
              Workspace:
            </label>
            <select
              id="workspace-select"
              data-testid="workspace-select"
              className="bg-brand-bg text-brand-text border border-brand-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent cursor-pointer"
              value={activeProject?.id || ''}
              onChange={(e) => selectProject(e.target.value)}
            >
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-3">
            <span className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm text-white">
              V
            </span>
            <span className="text-sm font-medium text-brand-text hidden sm:inline">Vedang M</span>
          </div>
        </header>

        {/* Global Error Banner */}
        {error && (
          <div role="alert" className="bg-red-950/40 border-b border-red-500/50 text-red-200 px-6 py-2.5 text-xs">
            <span>
              <strong>Error:</strong> {error}
            </span>
          </div>
        )}

        {/* Workspace Content Container */}
        <main className="flex-1 overflow-y-auto p-8 workspace-container" data-testid="workspace-container">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Project Header Card */}
            <div className="bg-brand-card border border-brand-border p-6 rounded-xl relative overflow-hidden shadow-lg">
              <div className="absolute top-0 left-0 w-2 h-full bg-brand-accent" />
              <h1 className="text-2xl font-bold tracking-tight text-brand-text mb-2">
                {activeProject?.name || 'Loading Workspace...'}
              </h1>
              <p className="text-sm text-brand-muted">
                {activeProject?.description || 'Active workspace initialization in progress.'}
              </p>
            </div>

            {/* Render Slot Children depending on active Tab */}
            {children || (
              <div className="space-y-6">
                {/* 1. Dashboard Tab */}
                {activeTab === 'dashboard' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="col-span-3 space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-brand-text">Performance Benchmark Card list</h2>
                        <span className="text-xs text-brand-muted bg-slate-800 px-2.5 py-1 rounded-md">
                          Rendering 100 elements
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        {Array.from({ length: 100 }, (_, idx) => (
                          <div
                            key={idx}
                            className="bg-brand-card border border-brand-border p-4 rounded-lg hover:border-blue-500/30 transition-all duration-150 flex flex-col justify-between"
                            data-testid="dummy-card"
                          >
                            <div className="text-xs text-brand-muted">Metric #{idx + 1}</div>
                            <div className="text-lg font-mono font-bold text-brand-text my-1.5">
                              {((idx * 43 + 127) % 1000).toFixed(2)}
                            </div>
                            <div className="text-[10px] text-emerald-400 flex items-center">
                              <svg className="w-3 h-3 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                              </svg>
                              +{((idx * 3 + 1) % 10).toFixed(1)}%
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Business DNA Tab */}
                {activeTab === 'dna' && (
                  <div className="space-y-6">
                    <div className="bg-brand-card border border-brand-border p-6 rounded-xl shadow-md">
                      <h2 className="text-lg font-bold text-brand-text mb-4">Extract Business DNA</h2>
                      <form onSubmit={handleDnaScan} className="flex gap-4 max-w-2xl">
                        <input
                          type="url"
                          required
                          value={websiteUrl}
                          onChange={(e) => setWebsiteUrl(e.target.value)}
                          placeholder="https://yourbrand.com"
                          className="bg-brand-bg text-brand-text border border-brand-border rounded-md px-4 py-2 flex-1 focus:outline-none focus:border-brand-accent text-sm"
                        />
                        <button
                          type="submit"
                          disabled={isScanningDna}
                          className="bg-brand-accent text-white px-5 py-2 rounded-md hover:bg-blue-600 transition-colors text-sm font-semibold disabled:opacity-50"
                        >
                          {isScanningDna ? 'Scanning...' : 'Scan DNA'}
                        </button>
                      </form>
                    </div>

                    {isScanningDna && (
                      <div className="flex items-center justify-center p-8 bg-brand-card border border-brand-border rounded-xl">
                        <div className="w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full animate-spin"></div>
                        <span className="ml-3 text-sm text-brand-muted">Analyzing typography, tone of voice, and color palettes...</span>
                      </div>
                    )}

                    {dnaResults && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-brand-card border border-brand-border p-6 rounded-xl">
                          <h3 className="font-bold text-brand-text mb-3">Extracted Style Kit</h3>
                          <div className="space-y-4">
                            <div>
                              <span className="text-xs text-brand-muted block mb-1.5">Color Palette</span>
                              <div className="flex gap-2">
                                {dnaResults.colors.map((c: string, idx: number) => (
                                  <div key={idx} className="flex flex-col items-center gap-1">
                                    <div className="w-10 h-10 rounded-md border border-brand-border" style={{ backgroundColor: c }} />
                                    <span className="text-[10px] font-mono text-brand-muted">{c}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <span className="text-xs text-brand-muted block">Primary Font</span>
                              <span className="text-sm font-semibold">{dnaResults.font}</span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-brand-card border border-brand-border p-6 rounded-xl">
                          <h3 className="font-bold text-brand-text mb-3">Tone & DNA Profile</h3>
                          <div className="space-y-3 text-sm">
                            <div>
                              <span className="text-xs text-brand-muted block">Tone of Voice</span>
                              <span>{dnaResults.tone}</span>
                            </div>
                            <div>
                              <span className="text-xs text-brand-muted block">Extracted Brand</span>
                              <span className="font-semibold text-brand-accent">{dnaResults.brandName}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. AI Photoshoot Tab */}
                {activeTab === 'photoshoot' && (
                  <div className="space-y-6">
                    <div className="bg-brand-card border border-brand-border p-6 rounded-xl">
                      <h2 className="text-lg font-bold text-brand-text mb-4">AI Product Photoshoot Studio</h2>
                      <form onSubmit={handlePhotoGenerate} className="space-y-4 max-w-2xl">
                        <div>
                          <label className="text-sm text-brand-muted block mb-1.5">Select Photoshoot Theme</label>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {['Studio', 'Ingredient', 'In Use', 'Contextual'].map((style) => (
                              <button
                                key={style}
                                type="button"
                                onClick={() => setPhotoshootStyle(style)}
                                className={`px-4 py-2.5 rounded-md text-xs font-bold border transition-all ${
                                  photoshootStyle === style
                                    ? 'bg-brand-accent text-white border-brand-accent'
                                    : 'bg-brand-bg text-brand-muted border-brand-border hover:border-slate-700'
                                }`}
                              >
                                {style}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="text-sm text-brand-muted block mb-1.5">Context Description (Prompt)</label>
                          <input
                            type="text"
                            required
                            value={scenePrompt}
                            onChange={(e) => setScenePrompt(e.target.value)}
                            placeholder="e.g. Set product on a clean wood table with warm ambient sunlight"
                            className="bg-brand-bg text-brand-text border border-brand-border rounded-md px-4 py-2.5 w-full focus:outline-none focus:border-brand-accent text-sm"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={isGeneratingPhoto}
                          className="bg-brand-accent text-white px-5 py-2.5 rounded-md hover:bg-blue-600 transition-colors text-sm font-semibold disabled:opacity-50"
                        >
                          {isGeneratingPhoto ? 'Generating Scene...' : 'Render Product Scene'}
                        </button>
                      </form>
                    </div>

                    {isGeneratingPhoto && (
                      <div className="flex items-center justify-center p-8 bg-brand-card border border-brand-border rounded-xl">
                        <div className="w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full animate-spin"></div>
                        <span className="ml-3 text-sm text-brand-muted">Rendering product scene in background with AI photoshoot assistant...</span>
                      </div>
                    )}

                    {generatedPhoto && (
                      <div className="bg-brand-card border border-brand-border p-6 rounded-xl flex flex-col md:flex-row gap-6 items-center">
                        <div className="w-48 h-48 bg-slate-800 rounded-lg flex items-center justify-center border border-brand-border text-xs text-brand-muted text-center p-4">
                          [Mock AI Render: {photoshootStyle}]
                        </div>
                        <div className="flex-1 space-y-2">
                          <h3 className="font-bold text-emerald-400">Render Successful</h3>
                          <p className="text-sm text-brand-text">{generatedPhoto}</p>
                          <span className="text-[10px] text-brand-muted block">Resolution: 1024x1024 px | Aspect: 1:1</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Campaign Creator Tab */}
                {activeTab === 'campaigns' && (
                  <div className="space-y-6">
                    <div className="bg-brand-card border border-brand-border p-6 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <h2 className="text-lg font-bold text-brand-text">AI Campaign Creator</h2>
                        <p className="text-xs text-brand-muted mt-1">Select campaign concept to generate copies aligned with your Business DNA</p>
                      </div>
                      <div className="flex gap-2">
                        <select
                          value={campaignType}
                          onChange={(e) => setCampaignType(e.target.value)}
                          className="bg-brand-bg text-brand-text border border-brand-border rounded-md px-3 py-1.5 text-xs focus:outline-none"
                        >
                          <option value="launch">Product Launch</option>
                          <option value="sale">Seasonal Promotion</option>
                          <option value="branding">Brand DNA Showcase</option>
                        </select>
                        <button
                          onClick={handleCampaignGenerate}
                          className="bg-brand-accent text-white px-4 py-1.5 rounded-md hover:bg-blue-600 transition-colors text-xs font-semibold"
                        >
                          Generate Copy
                        </button>
                      </div>
                    </div>

                    {campaignCopy && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-brand-card border border-brand-border p-6 rounded-xl space-y-2">
                          <span className="text-xs text-brand-accent font-bold uppercase tracking-wider block">Ad Headline</span>
                          <h3 className="font-bold text-brand-text">{campaignCopy.headline}</h3>
                          <p className="text-xs text-brand-muted leading-relaxed">{campaignCopy.body}</p>
                        </div>
                        <div className="bg-brand-card border border-brand-border p-6 rounded-xl space-y-2">
                          <span className="text-xs text-brand-accent font-bold uppercase tracking-wider block">Twitter/X Post</span>
                          <p className="text-sm text-brand-text leading-relaxed font-mono">"{campaignCopy.social}"</p>
                          <span className="text-[10px] text-brand-muted block">Character count: {campaignCopy.social.length} / 280</span>
                        </div>
                        <div className="bg-brand-card border border-brand-border p-6 rounded-xl space-y-2">
                          <span className="text-xs text-brand-accent font-bold uppercase tracking-wider block">Target Persona</span>
                          <h4 className="font-bold text-brand-text">SMEs & Productivity Seekers</h4>
                          <p className="text-xs text-brand-muted leading-relaxed">Generated copy matches tone parameters from website DNA profile analysis.</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 5. Settings Tab */}
                {activeTab === 'settings' && (
                  <div className="bg-brand-card border border-brand-border p-6 rounded-xl">
                    <h2 className="text-lg font-bold text-brand-text mb-4">Workspace Settings</h2>
                    <p className="text-sm text-brand-muted leading-relaxed">
                      This settings page configures default API endpoints, JWT token rotation timeboxes, database transaction timeouts, and client telemetry targets. Make sure settings remain aligned with verified SLA benchmarks.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="h-12 bg-brand-card border-t border-brand-border flex items-center justify-between px-6 text-xs text-brand-muted">
          <span>&copy; 2026 BrandCore Systems. All rights reserved.</span>
          <div className="flex space-x-4 items-center">
            <span className="flex items-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2" />
              Connected
            </span>
            <span>v1.0.0</span>
          </div>
        </footer>
      </div>
    </div>
  );
};
