import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initTheme } from './lib/theme';
import { initAnalytics } from './lib/analytics';
import './index.css';

// Applied before React renders anything - avoids a flash of the wrong
// theme on load if the user previously chose dark.
initTheme();

// No-op unless VITE_ANALYTICS_DOMAIN is set - see analytics.ts's own docstring.
initAnalytics();

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
