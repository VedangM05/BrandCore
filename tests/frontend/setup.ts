import '@testing-library/jest-dom';

// Polyfill performance APIs for test JSDOM environments if missing
if (typeof performance === 'undefined') {
  global.performance = {
    now: () => Date.now()
  } as any;
}
