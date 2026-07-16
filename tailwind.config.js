/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/frontend/index.html",
    "./src/frontend/src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#0B0F19',
          card: '#161F30',
          accent: '#3B82F6',
          border: '#1E293B',
          text: '#F8FAFC',
          muted: '#94A3B8'
        }
      }
    }
  },
  plugins: []
};
