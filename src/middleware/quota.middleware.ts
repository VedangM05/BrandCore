import { Request, Response, NextFunction } from 'express';
import { checkQuota } from '../services/quota.service';

export async function enforceQuotaMiddleware(req: Request, res: Response, next: NextFunction) {
  const hasUserIdHeader = Boolean(req.headers['x-user-id']);
  // req.user is set by requireAuth from a verified JWT - prefer it over the
  // spoofable x-user-id header/body, which only remain as a test/back-compat fallback.
  const userId = req.user?.userId || (req.headers['x-user-id'] as string) || req.body?.userId || 'default-user-id';
  const estimatedCost = req.body?.estimatedCostUsd || 0.05;
  const estimatedTokens = req.body?.estimatedTokens || 500;

  // In test mode, only enforce quota if x-user-id header, an authenticated user, or estimatedCostUsd is explicitly supplied
  if (process.env.NODE_ENV === 'test' && !hasUserIdHeader && !req.user && req.body?.estimatedCostUsd === undefined) {
    return next();
  }

  try {
    const quota = await checkQuota(userId, estimatedCost, estimatedTokens);
    if (!quota.allowed) {
      return res.status(429).json({
        error: 'Usage tier ceiling limit exceeded',
        code: 'QUOTA_EXCEEDED',
        tier: quota.tier,
        currentCostUsd: quota.currentCostUsd,
        costLimit: quota.costLimit,
        currentTokens: quota.currentTokens,
        tokenLimit: quota.tokenLimit
      });
    }
    next();
  } catch (error) {
    next(error);
  }
}
