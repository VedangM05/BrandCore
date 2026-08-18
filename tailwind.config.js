/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/frontend/index.html',
    './src/frontend/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          // Warm monochrome canvas - never pure white/black.
          bg: '#FBFAF7',
          surface: '#FFFFFF',
          sunken: '#F4F2EC',
          border: '#E7E4DB',
          'border-strong': '#D7D3C6',
          text: '#17160F',
          muted: '#6F6D60',
          faint: '#A9A692',
          // Single considered accent - deep pine ink, not AI-indigo/purple.
          primary: '#1F3B33',
          'primary-hover': '#15281F',
          'primary-soft': '#E7EEE9',
          'primary-soft-text': '#1F3B33',
          // Sidebar/inverse surface - warm charcoal, not slate-900 blue-black.
          ink: '#17160F',
          'ink-hover': '#26241A',
        },
        state: {
          success: '#EDF3EC',
          'success-text': '#346538',
          danger: '#FDEBEC',
          'danger-text': '#9F2F2D',
          warning: '#FBF3DB',
          'warning-text': '#956400',
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
