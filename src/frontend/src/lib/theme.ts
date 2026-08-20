export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'brandcore_theme';

/**
 * Single source of truth for the light/dark toggle - reads/writes the
 * explicit user choice (localStorage) and applies it via data-theme on
 * <html>, which index.css's [data-theme='dark'] block reads. When the user
 * has never chosen, data-theme is left unset entirely so the CSS's own
 * prefers-color-scheme fallback (also in index.css) decides instead -
 * this file only ever writes a value once the user actually toggles.
 */
export function getStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage unavailable (private browsing, etc.) - theme still
    // applies for this page load, just doesn't persist across reloads.
  }
}

/** Called once on app boot to restore a previously-chosen theme, if any. */
export function initTheme(): void {
  const stored = getStoredTheme();
  if (stored) document.documentElement.setAttribute('data-theme', stored);
}

/** What's actually rendered right now - the explicit choice, or the OS preference if none was ever made. */
export function getActiveTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
