import React from 'react';
import { TabId } from '../../types';
import {
  LogoMark,
  BoltIcon,
  CampaignsIcon,
  DnaIcon,
  CameraIcon,
  FolderIcon,
  SettingsIcon,
  CloseIcon,
} from '../icons';

interface NavItem {
  id: TabId;
  label: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'coordinator', label: 'Quick Generate', icon: BoltIcon },
  { id: 'campaigns', label: 'Campaigns', icon: CampaignsIcon },
  { id: 'dna', label: 'Business DNA', icon: DnaIcon },
  { id: 'photoshoot', label: 'AI Photoshoot', icon: CameraIcon },
  { id: 'library', label: 'Assets Library', icon: FolderIcon },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  /** Mobile-only drawer state - always visible/static at md: and up regardless of this. */
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, isMobileOpen = false, onMobileClose }) => (
  <>
    {/* Backdrop - mobile drawer only, never rendered at md: and up */}
    {isMobileOpen && (
      <div
        className="fixed inset-0 bg-brand-ink/50 z-30 md:hidden"
        onClick={onMobileClose}
        aria-hidden="true"
      />
    )}

    <aside
      className={`w-60 bg-brand-surface border-r border-brand-border flex flex-col shrink-0 fixed inset-y-0 left-0 z-40 transition-transform duration-200 ease-out md:static md:translate-x-0 ${
        isMobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="h-16 flex items-center justify-between gap-2.5 px-5 border-b border-brand-border">
        <div className="flex items-center gap-2.5">
          <LogoMark className="w-7 h-7 text-brand-primary shrink-0" />
          <span className="text-[15px] font-semibold tracking-tight text-brand-text">BrandCore</span>
        </div>
        <button
          type="button"
          onClick={onMobileClose}
          className="md:hidden text-brand-faint hover:text-brand-text transition-colors"
          aria-label="Close navigation menu"
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5" aria-label="Sidebar Navigation">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={(e) => {
              e.preventDefault();
              onTabChange(id);
              onMobileClose?.();
            }}
            className={`nav-item ${activeTab === id ? 'nav-item-active' : ''}`}
            aria-current={activeTab === id ? 'page' : undefined}
          >
            <Icon className="w-[18px] h-[18px] shrink-0" />
            <span>{label}</span>
          </a>
        ))}
      </nav>
    </aside>
  </>
);
