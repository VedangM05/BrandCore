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
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => (
  <aside className="w-60 bg-brand-surface border-r border-brand-border flex flex-col shrink-0">
    <div className="h-16 flex items-center gap-2.5 px-5 border-b border-brand-border">
      <LogoMark className="w-7 h-7 text-brand-primary shrink-0" />
      <span className="text-[15px] font-semibold tracking-tight text-brand-text">BrandCore</span>
    </div>

    <nav className="flex-1 px-3 py-4 space-y-0.5" aria-label="Sidebar Navigation">
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
        <a
          key={id}
          href={`#${id}`}
          onClick={(e) => {
            e.preventDefault();
            onTabChange(id);
          }}
          className={`nav-item ${activeTab === id ? 'nav-item-active' : ''}`}
          aria-current={activeTab === id ? 'page' : undefined}
        >
          <Icon className="w-[18px] h-[18px] shrink-0" />
          <span>{label}</span>
        </a>
      ))}
    </nav>

    <div className="p-3 border-t border-brand-border">
      <div className="rounded-md bg-brand-sunken border border-brand-border px-3 py-2.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold text-brand-muted uppercase tracking-wide">Agent engine</p>
          <span className="w-1.5 h-1.5 rounded-full bg-brand-primary" aria-hidden="true" />
        </div>
        <p className="text-xs text-brand-text mt-1">Groq agents active</p>
      </div>
    </div>
  </aside>
);
