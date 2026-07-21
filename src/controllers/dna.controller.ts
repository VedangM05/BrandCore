import { Request, Response } from 'express';
import { runDnaScan } from '../services/dna.service';

export async function handleDnaScan(req: Request, res: Response): Promise<void> {
  try {
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ error: 'URL is required' });
      return;
    }
    
    // Quick validation
    try {
      new URL(url);
    } catch {
      res.status(400).json({ error: 'Invalid URL format' });
      return;
    }

    const result = await runDnaScan(url);
    res.status(200).json(result);
  } catch (error: any) {
    console.error('[DNA] Scan failed:', error.message);
    res.status(500).json({ error: error.message || 'Internal server error during website crawl/parse' });
  }
}
