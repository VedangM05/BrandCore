import { Request, Response, NextFunction } from 'express';
import { generatePhotoshootImage, generateCampaignPost, generateCarousel } from '../services/photoshoot.service';

export async function handleGenerateImage(req: Request, res: Response, next: NextFunction) {
  const { brandDnaId, scenePrompt, style, aspect } = req.body;

  if (!brandDnaId || !scenePrompt) {
    return res.status(400).json({ error: 'Missing brandDnaId or scenePrompt parameter' });
  }
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const result = await generatePhotoshootImage(brandDnaId, scenePrompt, style || 'Studio', aspect, req.user.userId);
    return res.status(200).json({
      success: true,
      asset: result.asset,
      prompt: result.prompt,
      brandDnaId: result.brandDnaId,
    });
  } catch (error: any) {
    if (error.message?.includes('timed out') || error.message?.includes('Image provider')) {
      return res.status(502).json({ error: `Image generation failed: ${error.message}` });
    }
    next(error);
  }
}

export async function handleGeneratePost(req: Request, res: Response, next: NextFunction) {
  const { brandDnaId, prompt, channel, aspect } = req.body;

  if (!brandDnaId || !prompt) {
    return res.status(400).json({ error: 'Missing brandDnaId or prompt parameter' });
  }
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const result = await generateCampaignPost(brandDnaId, prompt, channel, aspect, req.user.userId);
    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    if (error.message?.includes('timed out') || error.message?.includes('Image provider')) {
      return res.status(502).json({ error: `Image generation failed: ${error.message}` });
    }
    next(error);
  }
}

export async function handleGenerateCarousel(req: Request, res: Response, next: NextFunction) {
  const { brandDnaId, prompt, slideCount, aspect } = req.body;

  if (!brandDnaId || !prompt) {
    return res.status(400).json({ error: 'Missing brandDnaId or prompt parameter' });
  }
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const result = await generateCarousel(
      brandDnaId,
      prompt,
      slideCount ? parseInt(slideCount, 10) : undefined,
      aspect,
      req.user.userId
    );
    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    if (error.message?.includes('timed out') || error.message?.includes('Image provider')) {
      return res.status(502).json({ error: `Image generation failed: ${error.message}` });
    }
    next(error);
  }
}
