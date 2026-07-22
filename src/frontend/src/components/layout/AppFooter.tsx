import React from 'react';

export const AppFooter: React.FC = () => (
  <footer className="h-11 border-t border-slate-200 bg-white flex items-center justify-between px-6 text-xs text-slate-600 shrink-0">
    <div className="flex items-center gap-4">
      <span>&copy; 2026 BrandCore Systems. All rights reserved.</span>
      <span className="text-slate-300">&middot;</span>
      <span className="text-slate-600">PostgreSQL Engine Connected</span>
    </div>
    <span className="font-semibold font-mono text-slate-700">v1.0.0 &middot; Enterprise Grade</span>
  </footer>
);
