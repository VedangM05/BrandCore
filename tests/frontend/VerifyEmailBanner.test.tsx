import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VerifyEmailBanner } from '../../src/frontend/src/components/auth/VerifyEmailBanner';

const mockUseAuth = jest.fn();
jest.mock('../../src/frontend/src/context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('VerifyEmailBanner', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('renders nothing when the user is already verified', () => {
    mockUseAuth.mockReturnValue({ user: { userId: 'u1', email: 'a@test.com', role: 'user', emailVerified: true } });
    const { container } = render(<VerifyEmailBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing when there is no user', () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { container } = render(<VerifyEmailBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  test('shows a nudge with a resend button for an unverified user', () => {
    mockUseAuth.mockReturnValue({ user: { userId: 'u1', email: 'unverified@test.com', role: 'user', emailVerified: false } });
    render(<VerifyEmailBanner />);
    expect(screen.getByRole('status')).toHaveTextContent('unverified@test.com');
    expect(screen.getByTestId('resend-verification-button')).toBeInTheDocument();
  });

  test('resend button calls the API and shows a sent confirmation', async () => {
    mockUseAuth.mockReturnValue({ user: { userId: 'u1', email: 'unverified@test.com', role: 'user', emailVerified: false } });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    render(<VerifyEmailBanner />);
    fireEvent.click(screen.getByTestId('resend-verification-button'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/resend-verification', expect.objectContaining({ method: 'POST' }));
    });
    expect(await screen.findByTestId('resend-verification-button')).toHaveTextContent('Sent');
  });

  test('dismiss button hides the banner', () => {
    mockUseAuth.mockReturnValue({ user: { userId: 'u1', email: 'unverified@test.com', role: 'user', emailVerified: false } });
    render(<VerifyEmailBanner />);
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
