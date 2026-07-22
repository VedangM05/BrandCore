import React from 'react';
import { Project } from '../../context/ProjectContext';
import { SearchIcon } from '../icons';

interface WorkspaceHeaderProps {
  projects: Project[];
  activeProject: Project | null;
  onSelectProject: (id: string) => void;
  userEmail?: string;
  onLogout?: () => void;
}

function initialsFromEmail(email: string): string {
  const local = email.split('@')[0] || '';
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase() || 'BC';
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  projects,
  activeProject,
  onSelectProject,
  userEmail,
  onLogout,
}) => (
  <header className="h-16 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 backdrop-blur-md">
    <div className="flex items-center gap-4 min-w-0">
      <label htmlFor="workspace-select" className="sr-only">
        Select workspace
      </label>
      <select
        id="workspace-select"
        data-testid="workspace-select"
        className="input-field w-auto min-w-[200px] max-w-[280px] py-2 font-semibold text-sm cursor-pointer bg-slate-950 border-slate-700 text-white"
        value={activeProject?.id || ''}
        onChange={(e) => onSelectProject(e.target.value)}
      >
        {projects.map((proj) => (
          <option key={proj.id} value={proj.id}>
            {proj.name}
          </option>
        ))}
      </select>

      <div className="hidden md:flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 w-72">
        <SearchIcon className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          type="search"
          placeholder="Search campaigns, assets..."
          className="bg-transparent text-sm w-full focus:outline-none text-white placeholder:text-slate-500"
          aria-label="Search"
        />
      </div>
    </div>

    <div className="flex items-center gap-4">
      {/* Telemetry Status Indicator */}
      <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-semibold text-emerald-400">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span>Telemetry Live &middot; OpenTelemetry Active</span>
      </div>

      {userEmail && (
        <span className="hidden sm:block text-xs font-medium text-slate-300 max-w-[180px] truncate">
          {userEmail}
        </span>
      )}
      {onLogout && (
        <button
          type="button"
          onClick={onLogout}
          className="btn-secondary py-1.5 px-3.5 text-xs"
          data-testid="logout-button"
        >
          Sign out
        </button>
      )}
      <div
        className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold shadow-md shadow-indigo-500/20 ring-2 ring-indigo-500/30"
        title={userEmail}
        aria-label={userEmail ? `Signed in as ${userEmail}` : 'User avatar'}
      >
        {userEmail ? initialsFromEmail(userEmail) : 'BC'}
      </div>
    </div>
  </header>
);
