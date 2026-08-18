import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Loaded explicitly (rather than relying on Vite's own automatic
  // import.meta.env exposure) because this repo's tsconfig targets
  // "module": "CommonJS" for tsc/ts-jest, which rejects `import.meta`
  // syntax outright (TS1343) - a `define`-injected global constant works
  // under both the Vite build and plain tsc type-checking. See
  // GoogleAuthButton.tsx / types/googleIdentity.d.ts.
  const env = loadEnv(mode, path.resolve(__dirname), '');

  return {
    plugins: [react()],
    root: path.resolve(__dirname, 'src/frontend'),
    define: {
      __GOOGLE_CLIENT_ID__: JSON.stringify(env.VITE_GOOGLE_CLIENT_ID || '')
    },
    build: {
      outDir: path.resolve(__dirname, 'dist/client'),
      emptyOutDir: true
    },
    server: {
      port: process.env.PORT ? Number(process.env.PORT) : 5173,
      host: true,
      proxy: {
        '/api': 'http://localhost:3000'
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    }
  };
});
