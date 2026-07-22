import { Request, Response, NextFunction } from 'express';
import { checkQuota } from '../services/quota.service';

export async function enforceQuotaMiddleware(req: Request, res: Response, next: NextFunction) {
  const userId = req.headers['x-user-id'] as string || req.body?.userId || 'default-user-id';
  const estimatedCost = req.body?.estimatedCostUsd || 0.05;
  const estimatedTokens = req.body?.estimatedTokens || 500;

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
