import '@testing-library/jest-dom';
// jsdom has no real <canvas> 2D context - the AssetEditor (Konva-based) needs
// one to mount at all in tests.
import 'jest-canvas-mock';

// Polyfill performance APIs for test JSDOM environments if missing
if (typeof performance === 'undefined') {
  global.performance = {
    now: () => Date.now()
  } as any;
}
