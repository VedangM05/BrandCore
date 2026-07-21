import React from 'react';

interface SpinnerProps {
  label?: string;
  size?: 'sm' | 'md';
  variant?: 'light' | 'dark';
}

export const Spinner: React.FC<SpinnerProps> = ({ label, size = 'md', variant = 'dark' }) => (
  <div className="flex items-center justify-center gap-3">
    <div
      className={`border-[3px] border-t-transparent rounded-full animate-spin ${
        size === 'sm' ? 'w-5 h-5' : 'w-8 h-8'
      } ${variant === 'light' ? 'border-white/30 border-t-white' : 'border-brand-primary/25 border-t-brand-primary'}`}
      role="status"
      aria-label={label || 'Loading'}
    />
    {label && (
      <span className={`text-sm ${variant === 'light' ? 'text-slate-300' : 'text-brand-muted'}`}>{label}</span>
    )}
  </div>
);
