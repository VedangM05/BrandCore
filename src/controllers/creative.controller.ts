import { Request, Response, NextFunction } from 'express';
import { executeCreativePipeline, generateCampaignIdeas } from '../services/creative.service';
import { resolveBrandDna } from '../services/brandDna.service';

export async function handleCreativeGenerate(req: Request, res: Response, next: NextFunction) {
  const { brandDnaId, prompt, forceScoreSequence, channel } = req.body;

  if (!brandDnaId || !prompt) {
    return res.status(400).json({ error: 'Missing brandDnaId or prompt parameter' });
  }
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // forceScoreSequence exists purely so tests can deterministically drive
  // the QA retry/best-of-N fallback paths (see tests/creative.test.ts) -
  // it must never be honored from a real request, or any authenticated
  // user could force their own content past Brand QA by just passing
  // forceScoreSequence: [100]. Silently ignored (not rejected with an
  // error) outside test mode, matching the same test-only-input pattern
  // already used by quota.middleware.ts.
  const effectiveForceScoreSequence = process.env.NODE_ENV === 'test' ? forceScoreSequence : undefined;

  try {
    const result = await executeCreativePipeline(brandDnaId, prompt, effectiveForceScoreSequence, channel, req.user.userId);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function handleCreativeIdeas(req: Request, res: Response, next: NextFunction) {
  const { brandDnaId } = req.query;

  if (!brandDnaId) {
    return res.status(400).json({ error: 'Missing brandDnaId query parameter' });
  }
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const { brandDna } = await resolveBrandDna(brandDnaId as string, req.user.userId);
    const ideas = await generateCampaignIdeas(brandDna);
    return res.status(200).json({ ideas });
  } catch (error) {
    next(error);
  }
}
