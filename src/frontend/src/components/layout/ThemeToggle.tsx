import React, { useEffect, useState } from 'react';
import { SunIcon, MoonIcon } from '../icons';
import { applyTheme, getActiveTheme, Theme } from '../../lib/theme';

export const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useState<Theme>('light');

  // Reads the actual active theme (explicit choice or OS preference) only
  // after mount - avoids a server/client mismatch flash and keeps this
  // component simple (index.html/main.tsx already applies the stored
  // theme before React even renders, via initTheme - see main.tsx).
  useEffect(() => {
    setTheme(getActiveTheme());
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn-secondary p-2"
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {theme === 'dark' ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
    </button>
  );
};
