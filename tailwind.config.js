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
          bg: '#f8fafc',
          surface: '#ffffff',
          elevated: '#f1f5f9',
          border: '#e2e8f0',
          muted: '#64748b',
          text: '#0f172a',
          primary: '#4f46e5',
          'primary-hover': '#4338ca',
          accent: '#0284c7',
          'accent-soft': '#f0f9ff',
          sidebar: '#0f172a',
          'sidebar-hover': '#1e293b',
          'sidebar-active': '#4f46e5',
        },
      },
      fontFamily: {
        sans: ['"Inter"', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.05)',
        panel: '0 4px 6px -1px rgba(15, 23, 42, 0.05), 0 2px 4px -2px rgba(15, 23, 42, 0.05)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1rem',
      },
    },
  },
  plugins: [],
};
