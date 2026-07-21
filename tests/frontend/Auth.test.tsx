import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../../src/frontend/src/App';

describe('App auth routing', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  test('should redirect unauthenticated users to login', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  test('should submit login form and call auth API', async () => {
    const payload = btoa(JSON.stringify({ userId: 'u1', email: 'user@test.com', role: 'user', exp: 9999999999 }));
    const fakeAccess = `header.${payload}.sig`;
    const fakeRefresh = `header.${payload}.sig`;

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ accessToken: fakeAccess, refreshToken: fakeRefresh }),
    });

    render(<App />);

    fireEvent.change(await screen.findByTestId('login-email'), { target: { value: 'user@test.com' } });
    fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'Password123!' } });
    fireEvent.click(screen.getByTestId('login-submit'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  test('should show signup page with link to login', async () => {
    window.history.pushState({}, 'Signup', '/signup');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Create account' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });
});
