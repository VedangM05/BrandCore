import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../../src/frontend/src/App';

describe('Forgot / reset password pages', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  test('forgot-password page submits and shows the identical-response success state', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: 'If an account exists for this email, a reset link has been sent.' }),
    });

    window.history.pushState({}, 'Forgot', '/forgot-password');
    render(<App />);

    fireEvent.change(await screen.findByTestId('forgot-email'), { target: { value: 'someone@example.com' } });
    fireEvent.click(screen.getByTestId('forgot-submit'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/forgot-password',
        expect.objectContaining({ method: 'POST' })
      );
    });
    expect(await screen.findByRole('status')).toHaveTextContent('someone@example.com');
  });

  test('login page links to the forgot-password page', async () => {
    window.history.pushState({}, 'Login', '/login');
    render(<App />);
    const link = await screen.findByRole('link', { name: 'Forgot password?' });
    expect(link).toHaveAttribute('href', '/forgot-password');
  });

  test('reset-password page with no token shows an invalid-link state', async () => {
    window.history.pushState({}, 'Reset', '/reset-password');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Invalid link' })).toBeInTheDocument();
  });

  test('reset-password page resets and redirects to login', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    window.history.pushState({}, 'Reset', '/reset-password?token=abc123');
    render(<App />);

    fireEvent.change(await screen.findByTestId('reset-password'), { target: { value: 'newPassword123' } });
    fireEvent.change(screen.getByTestId('reset-confirm'), { target: { value: 'newPassword123' } });
    fireEvent.click(screen.getByTestId('reset-submit'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/reset-password',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ token: 'abc123', newPassword: 'newPassword123' }),
        })
      );
    });
    expect(await screen.findByRole('status')).toHaveTextContent('reset successfully');
  });

  test('reset-password page rejects mismatched confirmation without calling the API', async () => {
    global.fetch = jest.fn();
    window.history.pushState({}, 'Reset', '/reset-password?token=abc123');
    render(<App />);

    fireEvent.change(await screen.findByTestId('reset-password'), { target: { value: 'newPassword123' } });
    fireEvent.change(screen.getByTestId('reset-confirm'), { target: { value: 'somethingElse' } });
    fireEvent.click(screen.getByTestId('reset-submit'));

    expect(await screen.findByRole('alert')).toHaveTextContent('do not match');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('Verify-email page', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  test('shows a success state for a valid token', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, alreadyVerified: false }),
    });

    window.history.pushState({}, 'Verify', '/verify-email?token=goodtoken');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument();
  });

  test('shows an error state for an invalid/expired token', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'This verification link is invalid or has expired.' }),
    });

    window.history.pushState({}, 'Verify', '/verify-email?token=badtoken');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Verification link invalid' })).toBeInTheDocument();
  });

  test('shows an error state with no token at all, without calling the API', async () => {
    global.fetch = jest.fn();
    window.history.pushState({}, 'Verify', '/verify-email');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Verification link invalid' })).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
