import React, { useEffect, useRef, useState } from 'react';
import { GoogleGlyph } from '../icons';

/**
 * Whether a Google client id is configured, so pages can decide whether to
 * render the "or continue with email" divider around the button (avoiding
 * an orphaned divider with nothing above it when Google sign-in isn't set
 * up - see .env.example).
 */
export function isGoogleAuthConfigured(): boolean {
  return typeof __GOOGLE_CLIENT_ID__ !== 'undefined' && Boolean(__GOOGLE_CLIENT_ID__);
}

export interface GoogleAuthButtonProps {
  label?: string;
  onSuccess: (accessToken: string) => void | Promise<void>;
  onError?: (message: string) => void;
  disabled?: boolean;
}

/**
 * Fully custom "Continue with Google" button - unlike Google's own rendered
 * identity button (`google.accounts.id.renderButton`), which Google's brand
 * guidelines require keeping mostly as-is, this uses the OAuth 2.0 token
 * client (`google.accounts.oauth2.initTokenClient`) so the trigger element
 * is an ordinary button we fully control (see `.btn-secondary` in
 * index.css) - only the small four-color "G" glyph is Google's mark, kept
 * to make the option instantly recognizable.
 *
 * The actual Google consent popup that opens on click is Google's own UI
 * and can't be replaced - that's the standard, expected "Continue with X"
 * pattern used across the web, not a design choice this component makes.
 *
 * Renders nothing if VITE_GOOGLE_CLIENT_ID isn't configured or the GIS
 * script hasn't loaded yet, rather than showing a broken/dead button - see
 * .env.example for how to obtain a client id.
 */
export const GoogleAuthButton: React.FC<GoogleAuthButtonProps> = ({ label = 'Continue with Google', onSuccess, onError, disabled }) => {
  const [ready, setReady] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const tokenClientRef = useRef<GoogleTokenClient | null>(null);

  const clientId = typeof __GOOGLE_CLIENT_ID__ !== 'undefined' && __GOOGLE_CLIENT_ID__ ? __GOOGLE_CLIENT_ID__ : undefined;

  useEffect(() => {
    if (!clientId) return;

    let cancelled = false;
    // The GIS script (index.html) loads async/defer, so it may not be on
    // window yet on first render - poll briefly rather than requiring a
    // specific mount order between the <script> tag and this component.
    const trySetup = () => {
      if (cancelled) return;
      if (window.google?.accounts?.oauth2) {
        tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'openid email profile',
          callback: async (response) => {
            setRequesting(false);
            if (!response?.access_token) {
              onError?.('Google sign-in did not return an access token');
              return;
            }
            await onSuccess(response.access_token);
          },
          error_callback: (error) => {
            setRequesting(false);
            // "popup_closed" is the user simply cancelling - not a real error.
            if (error?.type !== 'popup_closed') {
              onError?.(error?.message || 'Google sign-in failed');
            }
          },
        });
        setReady(true);
      } else {
        setTimeout(trySetup, 150);
      }
    };
    trySetup();

    return () => {
      cancelled = true;
    };
  }, [clientId, onSuccess, onError]);

  if (!clientId) return null;

  return (
    <button
      type="button"
      className="btn-secondary w-full py-3"
      disabled={disabled || !ready || requesting}
      onClick={() => {
        setRequesting(true);
        tokenClientRef.current?.requestAccessToken();
      }}
      data-testid="google-auth-button"
    >
      <GoogleGlyph className="h-4 w-4 shrink-0" />
      {requesting ? 'Waiting for Google…' : label}
    </button>
  );
};
