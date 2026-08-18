import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { LogoMark } from '../icons';
import { prefersReducedMotion } from '../../lib/motion';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ title, subtitle, children, footer }) => {
  const formRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion() || !formRef.current) return;
      gsap.fromTo(
        formRef.current,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }
      );
    },
    { scope: formRef }
  );

  return (
    <div className="min-h-dvh bg-brand-bg flex">
      <a href="#auth-form" className="skip-link">Skip to form</a>

      <aside className="hidden lg:flex lg:w-[44%] relative bg-brand-ink text-brand-bg flex-col justify-between p-12 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(60% 50% at 20% 15%, rgba(231,238,233,0.10) 0%, rgba(23,22,15,0) 70%)',
          }}
          aria-hidden="true"
        />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <LogoMark className="w-8 h-8 text-brand-bg" />
            <span className="text-base font-semibold tracking-tight">BrandCore</span>
          </div>
          <h1 className="font-display text-[2.75rem] leading-[1.08] mt-16 tracking-tightest text-brand-bg max-w-md">
            Your brand&rsquo;s voice, read once and reused everywhere.
          </h1>
          <p className="text-white/50 mt-5 leading-relaxed max-w-sm text-[15px]">
            Scan a website to extract its identity, then plan and draft on-brand campaign copy from that
            single source of truth.
          </p>
        </div>
        <p className="relative text-xs text-white/35 font-mono">&copy; {new Date().getFullYear()} BrandCore</p>
      </aside>

      <main className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[26rem]" ref={formRef} id="auth-form">
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <LogoMark className="w-7 h-7 text-brand-primary" />
            <span className="text-base font-semibold text-brand-text">BrandCore</span>
          </div>

          <div className="panel p-8">
            <h2 className="font-display text-3xl tracking-tighter text-brand-text">{title}</h2>
            <p className="text-sm text-brand-muted mt-2 mb-7 leading-relaxed">{subtitle}</p>
            {children}
          </div>

          <p className="text-sm text-brand-muted text-center mt-6">{footer}</p>
        </div>
      </main>
    </div>
  );
};

export const AuthLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
  <Link to={to} className="font-medium text-brand-primary hover:text-brand-primary-hover transition-colors">
    {children}
  </Link>
);
