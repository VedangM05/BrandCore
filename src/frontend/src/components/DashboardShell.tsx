import React, { useEffect, useState } from 'react';
import { useProject } from '../context/ProjectContext';
import { traceLayoutMount } from '../telemetry';

export const DashboardShell: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { projects, activeProject, selectProject, error } = useProject();
  const [mountTime, setMountTime] = useState<number>(0);

  const start = performance.now();

  useEffect(() => {
    const duration = performance.now() - start;
    setMountTime(duration);

    if (duration > 150) {
      console.warn(`[DashboardShell] Mount latency exceeded SLA target: ${duration.toFixed(2)}ms`);
    }

    traceLayoutMount('DashboardShell', start);
  }, []);

  return (
    <div className="flex h-screen bg-brand-bg text-brand-text font-sans overflow-hidden">
      {/* Sidebar Workspace Navigator */}
      <aside className="w-64 bg-brand-card border-r border-brand-border flex flex-col justify-between">
        <div>
          {/* Logo Zone */}
          <div className="h-16 flex items-center px-6 border-b border-brand-border">
            <span className="text-xl font-bold tracking-wider text-brand-accent bg-blue-900/20 px-3 py-1 rounded">
              BrandCore
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-2" aria-label="Sidebar Navigation">
            <a href="#dashboard" className="flex items-center px-4 py-3 text-sm font-medium rounded-lg bg-blue-600/10 text-brand-accent border-l-4 border-brand-accent transition-all duration-150">
              <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Dashboard
            </a>
            <a href="#campaigns" className="flex items-center px-4 py-3 text-sm font-medium text-brand-muted hover:text-brand-text hover:bg-slate-800/40 rounded-lg transition-all duration-150">
              <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Campaigns
            </a>
            <a href="#settings" className="flex items-center px-4 py-3 text-sm font-medium text-brand-muted hover:text-brand-text hover:bg-slate-800/40 rounded-lg transition-all duration-150">
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

            {/* Render Slot Children */}
            {children || (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Default content with 100 metrics cards to verify performance and scrolling */}
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
