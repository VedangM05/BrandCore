import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App } from '../../src/frontend/src/App';

/**
 * __GOOGLE_CLIENT_ID__ is a Vite `define`-time global (see vite.config.ts) -
 * it's never present under ts-jest/jsdom, so it's stubbed directly on
 * `global` here. window.google is likewise stubbed rather than loading the
 * real Google Identity Services script, mirroring how Auth.test.tsx mocks
 * fetch instead of hitting a real backend.
 */
function mockGoogleIdentityServices() {
  const requestAccessToken = jest.fn();
  let capturedCallback: ((response: { access_token: string }) => void) | undefined;
  let capturedErrorCallback: ((error: { type: string; message?: string }) => void) | undefined;

  (window as any).google = {
    accounts: {
      oauth2: {
        initTokenClient: (config: any) => {
          capturedCallback = config.callback;
          capturedErrorCallback = config.error_callback;
          return { requestAccessToken };
        },
      },
    },
  };

  return {
    requestAccessToken,
    // capturedCallback is async (GoogleAuthButton awaits onSuccess inside
    // it) - act() must be given (and awaited on) an async function too, or
    // the state updates it triggers escape act's tracking and corrupt later
    // assertions/tests.
    triggerSuccess: (accessToken: string) => act(async () => { await capturedCallback?.({ access_token: accessToken }); }),
    triggerError: (error: { type: string; message?: string }) => act(async () => { await capturedErrorCallback?.(error); }),
  };
}

describe('Google sign-in on the auth pages', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
    (global as any).__GOOGLE_CLIENT_ID__ = 'test-client-id';
  });

  afterEach(() => {
    delete (window as any).google;
    delete (global as any).__GOOGLE_CLIENT_ID__;
  });

  test('does not render the Google button when no client id is configured', async () => {
    delete (global as any).__GOOGLE_CLIENT_ID__;
    render(<App />);
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(screen.queryByTestId('google-auth-button')).not.toBeInTheDocument();
  });

  test('renders the Google button and completes login on a successful token response', async () => {
    const google = mockGoogleIdentityServices();

    const payload = btoa(JSON.stringify({ userId: 'g1', email: 'googleuser@test.com', role: 'user', exp: 9999999999 }));
    const fakeToken = `header.${payload}.sig`;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        accessToken: fakeToken,
        refreshToken: fakeToken,
        user: { userId: 'g1', email: 'googleuser@test.com', role: 'user' },
      }),
    });

    render(<App />);
    const button = await screen.findByTestId('google-auth-button');

    fireEvent.click(button);
    expect(google.requestAccessToken).toHaveBeenCalled();

    // Simulate Google's popup resolving with an access token.
    await google.triggerSuccess('fake-google-access-token');

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/google',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ accessToken: 'fake-google-access-token' }),
        })
      );
    });
  });

  test('shows an error and does not crash when Google reports a real error', async () => {
    const google = mockGoogleIdentityServices();
    render(<App />);
    const button = await screen.findByTestId('google-auth-button');

    fireEvent.click(button);
    await google.triggerError({ type: 'access_denied', message: 'Access was denied' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Access was denied');
  });

  test('treats a user-cancelled popup as silent, not an error banner', async () => {
    const google = mockGoogleIdentityServices();
    render(<App />);
    const button = await screen.findByTestId('google-auth-button');

    fireEvent.click(button);
    await google.triggerError({ type: 'popup_closed' });

    // Give any (incorrect) error state a chance to render, then assert it didn't.
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('also renders on the signup page', async () => {
    mockGoogleIdentityServices();
    window.history.pushState({}, 'Signup', '/signup');
    render(<App />);

    await screen.findByRole('heading', { name: 'Create account' });
    expect(await screen.findByTestId('google-auth-button')).toHaveTextContent('Sign up with Google');
  });
});
