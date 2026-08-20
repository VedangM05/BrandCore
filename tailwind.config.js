/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/frontend/index.html',
    './src/frontend/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // References CSS custom properties (index.css) rather than
        // hardcoded hex, so the light/dark toggle (ThemeToggle.tsx) can
        // swap the actual values at runtime without a rebuild - the hex
        // values themselves still live in exactly one place, index.css's
        // :root / [data-theme='dark'] blocks, not duplicated here.
        brand: {
          bg: 'var(--color-bg)',
          surface: 'var(--color-surface)',
          sunken: 'var(--color-sunken)',
          border: 'var(--color-border)',
          'border-strong': 'var(--color-border-strong)',
          text: 'var(--color-text)',
          muted: 'var(--color-muted)',
          faint: 'var(--color-faint)',
          primary: 'var(--color-primary)',
          'primary-hover': 'var(--color-primary-hover)',
          'primary-soft': 'var(--color-primary-soft)',
          'primary-soft-text': 'var(--color-primary-soft-text)',
          ink: 'var(--color-ink)',
          'ink-hover': 'var(--color-ink-hover)',
        },
        state: {
          success: 'var(--color-state-success)',
          'success-text': 'var(--color-state-success-text)',
          danger: 'var(--color-state-danger)',
          'danger-text': 'var(--color-state-danger-text)',
          warning: 'var(--color-state-warning)',
          'warning-text': 'var(--color-state-warning-text)',
        },
      },
      fontFamily: {
        sans: ['"Outfit"', '-apple-system', 'system-ui', 'sans-serif'],
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        // Ultra-diffuse, low-opacity - never a generic drop shadow.
        subtle: '0 1px 2px 0 rgba(23, 22, 15, 0.04)',
        panel: '0 1px 1px 0 rgba(23, 22, 15, 0.03), 0 4px 16px -8px rgba(23, 22, 15, 0.08)',
        lift: '0 8px 24px -12px rgba(23, 22, 15, 0.16)',
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '10px',
        xl: '12px',
      },
      letterSpacing: {
        tightest: '-0.04em',
        tighter: '-0.025em',
      },
    },
  },
  plugins: [],
};
