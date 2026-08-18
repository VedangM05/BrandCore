// Minimal ambient types for the Google Identity Services script
// (https://accounts.google.com/gsi/client), loaded via a <script> tag in
// index.html rather than an npm package - Google doesn't publish official
// types for it, and pulling in a large community @types package for a
// handful of fields isn't worth it. Only the OAuth 2.0 token client surface
// used by GoogleAuthButton.tsx is declared.
export {};

declare global {
  // Injected by vite.config.ts's `define` from VITE_GOOGLE_CLIENT_ID (see
  // .env.example) - not `import.meta.env`, since this repo's tsconfig
  // targets CommonJS modules and rejects `import.meta` syntax. Always guard
  // reads with `typeof __GOOGLE_CLIENT_ID__ !== 'undefined'` (see
  // GoogleAuthButton.tsx) - outside a real Vite build (e.g. Jest) this
  // global is never defined at all.
  const __GOOGLE_CLIENT_ID__: string;

  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: { type: string; message?: string }) => void;
          }): GoogleTokenClient;
        };
      };
    };
  }

  interface GoogleTokenResponse {
    access_token: string;
    expires_in: number;
    scope: string;
    token_type: string;
  }

  interface GoogleTokenClient {
    requestAccessToken(overrideConfig?: { prompt?: string }): void;
  }
}
