import { Request, Response } from 'express';
import { registerUser, authenticateUser, rotateRefreshToken } from '../services/auth.service';

export async function handleRegister(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, role } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    const userId = await registerUser(email, password, role);
    res.status(201).json({
      message: 'User registered successfully',
      userId,
    });
  } catch (error: any) {
    if (error.message === 'Email already registered') {
      res.status(409).json({ error: error.message });
      return;
    }
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
    res.status(500).json({ error: error.message || 'Internal server error' });
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
