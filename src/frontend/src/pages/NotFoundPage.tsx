import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { LogoMark, ArrowLeftIcon } from '../components/icons';
import { prefersReducedMotion } from '../lib/motion';

export const NotFoundPage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion() || !containerRef.current) return;
      gsap.fromTo(
        containerRef.current,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }
      );
    },
    { scope: containerRef }
  );

  return (
    <div className="min-h-dvh bg-brand-bg flex items-center justify-center p-6">
      <div ref={containerRef} className="w-full max-w-md text-center">
        <Link to="/" className="inline-flex items-center gap-2 mb-10">
          <LogoMark className="w-7 h-7 text-brand-primary" />
          <span className="text-base font-semibold text-brand-text">BrandCore</span>
        </Link>

        <p className="font-mono text-sm text-brand-faint tracking-wide">404</p>
        <h1 className="font-display text-4xl tracking-tighter text-brand-text mt-2">
          This page doesn&rsquo;t exist.
        </h1>
        <p className="text-sm text-brand-muted mt-3 leading-relaxed">
          The link may be broken, or the page may have moved. Check the address, or head back to your
          workspace.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <Link to="/" className="btn-primary px-5 py-2.5 text-sm inline-flex items-center gap-2">
            <ArrowLeftIcon className="w-4 h-4" />
            Back to workspace
          </Link>
        </div>
      </div>
    </div>
  );
};
