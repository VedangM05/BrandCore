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
          bg: '#f4f5f7',
          surface: '#ffffff',
          elevated: '#fafbfc',
          border: '#e2e5eb',
          muted: '#64748b',
          text: '#0f172a',
          primary: '#4f46e5',
          'primary-hover': '#4338ca',
          accent: '#f97316',
          'accent-soft': '#fff7ed',
          sidebar: '#111827',
          'sidebar-hover': '#1f2937',
          'sidebar-active': '#312e81',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 3px rgba(15, 23, 42, 0.06), 0 4px 12px rgba(15, 23, 42, 0.04)',
        panel: '0 8px 30px rgba(15, 23, 42, 0.08)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1rem',
      },
    },
  },
  plugins: [],
};
