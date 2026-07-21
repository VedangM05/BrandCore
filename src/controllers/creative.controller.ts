import { Request, Response, NextFunction } from 'express';
import { executeCreativePipeline } from '../services/creative.service';

export async function handleCreativeGenerate(req: Request, res: Response, next: NextFunction) {
  const { brandDnaId, prompt, forceScoreSequence } = req.body;

  if (!brandDnaId || !prompt) {
    return res.status(400).json({ error: 'Missing brandDnaId or prompt parameter' });
  }

  try {
    const result = await executeCreativePipeline(brandDnaId, prompt, forceScoreSequence);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
