import React from 'react';
import { Link } from 'react-router-dom';

export const AppFooter: React.FC = () => (
  <footer className="h-11 border-t border-brand-border bg-brand-surface flex items-center justify-between px-6 text-xs text-brand-muted shrink-0">
    <span>&copy; {new Date().getFullYear()} BrandCore</span>
    <nav aria-label="Footer" className="flex items-center gap-5">
      <Link to="/privacy" className="hover:text-brand-text transition-colors">
        Privacy
      </Link>
      <Link to="/terms" className="hover:text-brand-text transition-colors">
        Terms
      </Link>
      <a href="mailto:support@brandcore.app" className="hover:text-brand-text transition-colors">
        Support
      </a>
      <span className="font-mono text-brand-faint">v1.0.0</span>
    </nav>
  </footer>
);
