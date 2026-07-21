import React from 'react';
import { Link } from 'react-router-dom';
import { LogoMark } from '../icons';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ title, subtitle, children, footer }) => (
  <div className="min-h-screen bg-brand-bg flex">
    <aside className="hidden lg:flex lg:w-[42%] bg-brand-sidebar text-white flex-col justify-between p-10">
      <div>
        <div className="flex items-center gap-3">
          <LogoMark className="w-10 h-10 text-brand-primary" />
          <span className="text-xl font-bold">BrandCore</span>
        </div>
        <h1 className="text-3xl font-bold mt-12 leading-tight">Your brand workspace, from first crawl to final campaign.</h1>
        <p className="text-slate-400 mt-4 leading-relaxed max-w-md">
          Sign in to manage campaigns, extract brand DNA from websites, and ship on-brand creative assets.
        </p>
      </div>
      <p className="text-xs text-slate-500">&copy; 2026 BrandCore Systems</p>
    </aside>

    <main className="flex-1 flex items-center justify-center p-6 sm:p-10">
      <div className="w-full max-w-md">
        <div className="lg:hidden flex items-center gap-2 mb-8">
          <LogoMark className="w-8 h-8 text-brand-primary" />
          <span className="text-lg font-bold text-brand-text">BrandCore</span>
        </div>

        <div className="panel p-8 shadow-panel">
          <h2 className="text-2xl font-bold text-brand-text">{title}</h2>
          <p className="text-sm text-brand-muted mt-1 mb-6">{subtitle}</p>
          {children}
        </div>

        <p className="text-sm text-brand-muted text-center mt-6">{footer}</p>
      </div>
    </main>
  </div>
);

export const AuthLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
  <Link to={to} className="font-semibold text-brand-primary hover:text-brand-primary-hover transition-colors">
    {children}
  </Link>
);
