import { Request, Response, NextFunction } from 'express';
import { semanticCache } from '../services/cache.service';
import { checkQuota, recordUsage, resetInMemoryUsage, setUserTier } from '../services/quota.service';

export async function handleCacheCheck(req: Request, res: Response, next: NextFunction) {
  const { key, prompt } = req.body;
  const userId = req.user?.userId || (req.headers['x-user-id'] as string) || req.body?.userId || 'default-user-id';

  if (!key && !prompt) {
    return res.status(400).json({ error: 'Missing required parameter: key or prompt' });
  }

  try {
    const lookupKey = key || prompt;
    const result = await semanticCache.check(lookupKey, prompt || key);

    if (result.hit) {
      await recordUsage(userId, '/api/cache/check', 0, 0.0, true, result.type);
    }

    return res.status(200).json({
      success: true,
      hit: result.hit,
      type: result.type,
      similarity: result.similarity,
      data: result.data,
      tokensSaved: result.tokensSaved,
      costSaved: result.costSaved
    });
  } catch (error) {
    next(error);
  }
}

export async function handleCacheStore(req: Request, res: Response, next: NextFunction) {
  const { key, prompt, data, tokens, costUsd } = req.body;
  const userId = req.user?.userId || (req.headers['x-user-id'] as string) || req.body?.userId || 'default-user-id';

  if (!data) {
    return res.status(400).json({ error: 'Missing data to cache' });
  }

  try {
    const lookupKey = key || prompt;
    const tok = tokens || 100;
    const cost = costUsd !== undefined ? costUsd : 0.001;

    await semanticCache.set(lookupKey, prompt || key, data, tok, cost);
    await recordUsage(userId, '/api/cache/store', tok, cost, false, null);

    return res.status(200).json({ success: true, message: 'Response cached successfully' });
  } catch (error) {
    next(error);
  }
}

export async function handleUsageStats(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.userId || (req.headers['x-user-id'] as string) || (req.query.userId as string) || 'default-user-id';

  try {
    const quota = await checkQuota(userId, 0, 0);
    return res.status(200).json({
      success: true,
      userId,
      tier: quota.tier,
      currentCostUsd: quota.currentCostUsd,
      costLimit: quota.costLimit,
      currentTokens: quota.currentTokens,
      tokenLimit: quota.tokenLimit
    });
  } catch (error) {
    next(error);
  }
}

export async function handleUsageReset(req: Request, res: Response, next: NextFunction) {
  try {
    await semanticCache.clear();
    resetInMemoryUsage();
    return res.status(200).json({ success: true, message: 'Cache and usage stats reset successfully' });
  } catch (error) {
    next(error);
  }
}

/**
 * SECURITY (HANDOFF.md §22): this used to accept `userId` from the request
 * body with no check against the authenticated caller at all - any signed-in
 * user could set *any other user's* quota tier (including their own, to
 * self-upgrade to 'enterprise' for free) just by knowing/guessing a UUID,
 * since this route (app.ts) is only gated by requireAuth, not
 * requireRole('admin'). Found alongside the registration role-escalation
 * bug via the same "does this trust client-supplied identity/role input"
 * sweep. Fixed the same way requireRole already gates
 * /api/observability/test-failure: a non-admin caller may only ever target
 * their own `req.user.userId`; only an admin may set another user's tier.
 */
export async function handleSetTier(req: Request, res: Response, next: NextFunction) {
  const { userId, tier } = req.body;
  if (!userId || !tier) {
    return res.status(400).json({ error: 'Missing userId or tier' });
  }
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (userId !== req.user.userId && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Cannot set another user\'s tier' });
  }

  try {
    await setUserTier(userId, tier);
    return res.status(200).json({ success: true, message: `User tier set to ${tier}` });
  } catch (error) {
    next(error);
  }
}
