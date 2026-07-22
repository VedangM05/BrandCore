import React from 'react';
import { TabId } from '../../types';
import {
  LogoMark,
  CampaignsIcon,
  DnaIcon,
  CopyIcon,
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
  { id: 'campaigns', label: 'Campaigns', icon: CampaignsIcon },
  { id: 'dna', label: 'Business DNA', icon: DnaIcon },
  { id: 'creator', label: 'AI Brief Writer', icon: CopyIcon },
  { id: 'photoshoot', label: 'AI Photoshoot', icon: CameraIcon },
  { id: 'library', label: 'Assets Library', icon: FolderIcon },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => (
  <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col shrink-0" aria-label="Sidebar Navigation">
    <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800">
      <LogoMark className="w-8 h-8 text-indigo-500 shrink-0" />
      <div>
        <div className="text-white font-bold text-sm leading-tight tracking-wide">BrandCore</div>
        <div className="text-slate-400 text-[11px] font-medium">Enterprise Intelligence</div>
      </div>
    </div>

    <nav className="flex-1 px-3 py-5 space-y-1.5" aria-label="Sidebar Navigation">
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
        <a
          key={id}
          href={`#${id}`}
          onClick={(e) => {
            e.preventDefault();
            onTabChange(id);
          }}
          className={`nav-item ${activeTab === id ? 'nav-item-active' : ''}`}
          aria-label={label}
          aria-current={activeTab === id ? 'page' : undefined}
        >
          <Icon className={`w-5 h-5 shrink-0 transition-colors ${activeTab === id ? 'text-indigo-400 opacity-100' : 'opacity-70'}`} />
          <span className="font-medium text-sm">{label}</span>
        </a>
      ))}
    </nav>

    <div className="p-4 border-t border-slate-800">
      <div className="rounded-xl bg-slate-900 border border-slate-800/80 px-3.5 py-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Agent Workspace</p>
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
        </div>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          Powered by Gemini 2.5 & LangGraph Agents.
        </p>
      </div>
    </div>
  </aside>
);
