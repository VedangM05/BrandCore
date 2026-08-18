import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv';

dotenv.config();

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access_secret';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Verifies the JWT access token sent in the Authorization: Bearer <token> header
 * and attaches the decoded identity to req.user. Rejects the request with 401
 * if the header is missing or the token is invalid/expired.
 *
 * This was previously missing entirely - every non-auth route was reachable
 * without any token, which meant login/register/refresh worked but enforced
 * nothing anywhere else in the API.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET) as jwt.JwtPayload;
    if (!decoded.userId || !decoded.email) {
      res.status(401).json({ error: 'Invalid access token' });
      return;
    }
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role || 'user'
    };
    next();
  } catch (err: any) {
    const message = err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token';
    res.status(401).json({ error: message });
  }
}

/**
 * Restricts a route to one of `allowedRoles`. Must run after `requireAuth`
 * (reads `req.user.role`, set there from the verified JWT - never trusts a
 * client-supplied role). Previously `users.role` was issued in every JWT but
 * checked nowhere in the app at all - entirely decorative. This is the
 * first real use of it, closing the gap flagged in HANDOFF.md §17 for
 * `POST /api/observability/test-failure` (open to any authenticated user).
 *
 * 403s (not 404) - unlike the ownership checks elsewhere in this app, there's
 * nothing here to hide the existence of; the route is public knowledge, just
 * role-gated.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions for this action' });
      return;
    }
    next();
  };
}
