import { Request, Response } from 'express';
import {
  registerUser,
  authenticateUser,
  rotateRefreshToken,
  revokeRefreshToken,
  authenticateWithGoogle,
  sendVerificationEmail,
  verifyEmailToken,
  requestPasswordReset,
  resetPassword,
} from '../services/auth.service';

export async function handleRegister(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    // SECURITY: never accept `role` from this public, unauthenticated
    // request body - this used to destructure req.body.role and pass it
    // straight through to registerUser(), letting anyone self-register as
    // 'admin' and immediately receive a real admin-scoped JWT. Confirmed
    // exploitable with a plain curl POST during this session's security
    // review (HANDOFF.md §22) - requireRole('admin') gates real endpoints
    // (observability.controller.ts), so this was a complete RBAC bypass,
    // not a cosmetic issue. registerUser()'s `role` parameter still
    // exists for trusted internal callers (seedDefaultUsers in this same
    // file), just never fed from request input here.
    const userId = await registerUser(email, password);
    const session = await authenticateUser(email, password);

    // Best-effort - a slow/misconfigured email provider must never fail
    // registration itself. The user can request another one via
    // /api/auth/resend-verification if this silently doesn't arrive.
    try {
      await sendVerificationEmail(userId, session.user.email);
    } catch (emailErr: any) {
      console.error('[Auth] Verification email failed to send (non-fatal):', emailErr.message);
    }

    res.status(201).json({
      message: 'User registered successfully',
      userId,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: session.user,
    });
  } catch (error: any) {
    if (
      error.message === 'Email already registered' ||
      error.code === '23505' ||
      error.message?.includes('unique constraint')
    ) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }
    console.error('[Auth] Register failed:', error.message);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

export async function handleLogin(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    const tokens = await authenticateUser(email, password);
    res.status(200).json(tokens);
  } catch (error: any) {
    if (error.message === 'Invalid email or password') {
      res.status(401).json({ error: error.message });
      return;
    }
    console.error('[Auth] Login failed:', error.message);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

export async function handleGoogleAuth(req: Request, res: Response): Promise<void> {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      res.status(400).json({ error: 'accessToken is required' });
      return;
    }
    const session = await authenticateWithGoogle(accessToken);
    res.status(200).json(session);
  } catch (error: any) {
    if (error.message?.includes('not configured')) {
      res.status(503).json({ error: error.message });
      return;
    }
    if (
      error.message?.includes('rejected this token') ||
      error.message?.includes('not issued for this application') ||
      error.message?.includes('email is not verified') ||
      error.message?.includes('Failed to verify Google token') ||
      error.message?.includes('access token is required')
    ) {
      res.status(401).json({ error: error.message });
      return;
    }
    console.error('[Auth] Google sign-in failed:', error.message);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

export async function handleVerifyEmail(req: Request, res: Response): Promise<void> {
  try {
    const token = (req.query.token as string) || req.body?.token;
    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }
    const result = await verifyEmailToken(token);
    if (!result.success) {
      res.status(400).json({ error: 'This verification link is invalid or has expired. Request a new one and try again.' });
      return;
    }
    res.status(200).json({ success: true, alreadyVerified: result.alreadyVerified });
  } catch (error: any) {
    console.error('[Auth] Email verification failed:', error.message);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

export async function handleResendVerification(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    await sendVerificationEmail(req.user.userId, req.user.email);
    // Always 200 - this is an authenticated user resending to their own
    // address, so there's no "does this account exist" leak to worry about
    // here (unlike forgot-password below).
    res.status(200).json({ success: true, message: 'Verification email sent' });
  } catch (error: any) {
    console.error('[Auth] Resend verification failed:', error.message);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

export async function handleForgotPassword(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }
    await requestPasswordReset(email);
    // Identical response whether or not the email exists/has a local
    // account - see requestPasswordReset's docstring for why.
    res.status(200).json({ success: true, message: 'If an account exists for this email, a reset link has been sent.' });
  } catch (error: any) {
    console.error('[Auth] Forgot-password failed:', error.message);
    // Still don't leak anything - report success-shaped even on an
    // unexpected internal error, and log it server-side for debugging.
    res.status(200).json({ success: true, message: 'If an account exists for this email, a reset link has been sent.' });
  }
}

export async function handleResetPassword(req: Request, res: Response): Promise<void> {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      res.status(400).json({ error: 'Token and new password are required' });
      return;
    }
    await resetPassword(token, newPassword);
    res.status(200).json({ success: true, message: 'Password reset successfully. Please sign in with your new password.' });
  } catch (error: any) {
    if (error.message?.includes('Invalid or expired')) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error.message?.includes('at least 8 characters')) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('[Auth] Reset password failed:', error.message);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

export async function handleLogout(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error: any) {
    // Logout must never fail the client-side sign-out - report success either way.
    console.error('[Auth] Logout revocation failed:', error.message);
    res.status(200).json({ message: 'Logged out successfully' });
  }
}

export async function handleRefresh(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token is required' });
      return;
    }
    const tokens = await rotateRefreshToken(refreshToken);
    res.status(200).json(tokens);
  } catch (error: any) {
    if (
      error.message.includes('Invalid or expired') ||
      error.message.includes('reuse detected')
    ) {
      res.status(401).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
