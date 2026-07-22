import React from 'react';

export const AppFooter: React.FC = () => (
  <footer className="h-11 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between px-6 text-xs text-slate-400 shrink-0">
    <div className="flex items-center gap-4">
      <span>&copy; 2026 BrandCore Systems. All rights reserved.</span>
      <span className="text-slate-600">&middot;</span>
      <span className="text-slate-400">PostgreSQL Engine Connected</span>
    </div>
    <span className="font-semibold font-mono text-slate-400">v1.0.0 &middot; Production Grade</span>
  </footer>
);
