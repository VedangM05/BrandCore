import React from 'react';
import { Project } from '../../context/ProjectContext';
import { SearchIcon, MenuIcon } from '../icons';
import { ThemeToggle } from './ThemeToggle';

interface WorkspaceHeaderProps {
  projects: Project[];
  activeProject: Project | null;
  onSelectProject: (id: string) => void;
  userEmail?: string;
  onLogout?: () => void;
  /** Opens the mobile nav drawer (Sidebar) - only rendered below md:, since the sidebar is static/always-visible above it. */
  onMenuClick?: () => void;
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
  onMenuClick,
}) => (
  <header className="h-16 bg-brand-surface border-b border-brand-border flex items-center justify-between px-3 sm:px-6 shrink-0">
    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
      {onMenuClick && (
        <button
          type="button"
          onClick={onMenuClick}
          className="md:hidden text-brand-text p-1.5 -ml-1.5 shrink-0"
          aria-label="Open navigation menu"
        >
          <MenuIcon className="w-5 h-5" />
        </button>
      )}
      <label htmlFor="workspace-select" className="sr-only">
        Select workspace
      </label>
      <select
        id="workspace-select"
        data-testid="workspace-select"
        className="input-field w-auto min-w-[120px] sm:min-w-[190px] max-w-[150px] sm:max-w-[260px] py-2 font-medium text-sm cursor-pointer bg-brand-sunken border-brand-border"
        value={activeProject?.id || ''}
        onChange={(e) => onSelectProject(e.target.value)}
      >
        {projects.map((proj) => (
          <option key={proj.id} value={proj.id}>
            {proj.name}
          </option>
        ))}
      </select>

      <div className="hidden md:flex items-center gap-2 bg-brand-sunken border border-brand-border rounded-md px-3 py-2 w-64">
        <SearchIcon className="w-4 h-4 text-brand-faint shrink-0" />
        <input
          type="search"
          placeholder="Search campaigns, assets…"
          className="bg-transparent text-sm w-full focus:outline-none text-brand-text placeholder:text-brand-faint"
          aria-label="Search"
        />
      </div>
    </div>

    <div className="flex items-center gap-3">
      <ThemeToggle />
      {userEmail && (
        <span className="hidden sm:block text-xs font-medium text-brand-muted max-w-[180px] truncate">
          {userEmail}
        </span>
      )}
      {onLogout && (
        <button
          type="button"
          onClick={onLogout}
          className="btn-secondary py-1.5 px-3 text-xs"
          data-testid="logout-button"
        >
          Sign out
        </button>
      )}
      <div
        className="w-8 h-8 rounded-md bg-brand-ink flex items-center justify-center text-brand-bg text-[11px] font-semibold shrink-0"
        title={userEmail}
        aria-label={userEmail ? `Signed in as ${userEmail}` : 'User avatar'}
      >
        {userEmail ? initialsFromEmail(userEmail) : 'BC'}
      </div>
    </div>
  </header>
);
