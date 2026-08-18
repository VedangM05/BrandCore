import { Request, Response } from 'express';
import { runCoordinatorAgent, GenerationType } from '../services/coordinator.service';

const VALID_GENERATION_TYPES: GenerationType[] = ['text', 'image', 'post', 'carousel'];

export async function handleRunCoordinator(req: Request, res: Response): Promise<void> {
  const { url, prompt, channel, generationType, scenePrompt, style, aspect, slideCount } = req.body;

  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!url) {
    res.status(400).json({ error: 'url is required' });
    return;
  }
  try {
    new URL(url);
  } catch {
    res.status(400).json({ error: 'Invalid URL format' });
    return;
  }
  if (generationType !== undefined && !VALID_GENERATION_TYPES.includes(generationType)) {
    res.status(400).json({ error: `generationType must be one of: ${VALID_GENERATION_TYPES.join(', ')}` });
    return;
  }

  try {
    const result = await runCoordinatorAgent({
      url,
      userId: req.user.userId,
      prompt,
      channel,
      generationType,
      scenePrompt,
      style,
      aspect,
      slideCount,
    });
    res.status(200).json(result);
  } catch (error: any) {
    console.error('[Coordinator] Run failed:', error.message);
    res.status(500).json({ error: error.message || 'Internal server error running the coordinator agent' });
  }
}
