import { Request, Response } from 'express';
import { runDnaScan, updateBrandDna } from '../services/dna.service';
import { checkUrlSafeToFetch } from '../services/ssrf.service';

export async function handleDnaScan(req: Request, res: Response): Promise<void> {
  try {
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    // SECURITY (HANDOFF.md §22): SSRF guard - see ssrf.service.ts's
    // docstring. This used to be just a syntactic `new URL(url)` check with
    // no restriction on scheme or destination at all; any authenticated
    // user could point a scan at an internal/private address and have the
    // crawled response handed straight back to them.
    const ssrfCheck = await checkUrlSafeToFetch(url);
    if (!ssrfCheck.safe) {
      res.status(400).json({ error: ssrfCheck.reason || 'This URL cannot be scanned' });
      return;
    }

    // requireAuth guarantees req.user on this route; the check is defensive only.
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const result = await runDnaScan(url, req.user.userId);
    res.status(200).json(result);
  } catch (error: any) {
    console.error('[DNA] Scan failed:', error.message);
    res.status(500).json({ error: error.message || 'Internal server error during website crawl/parse' });
  }
}

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export async function handleUpdateBrandDna(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { title, tagline, tone, colors, font_pairings } = req.body;

  if (colors !== undefined) {
    if (!Array.isArray(colors) || colors.length === 0 || !colors.every((c) => typeof c === 'string' && HEX_COLOR_PATTERN.test(c))) {
      res.status(400).json({ error: 'colors must be a non-empty array of hex color strings (e.g. #1F3B33)' });
      return;
    }
  }

  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const updated = await updateBrandDna(id, { title, tagline, tone, colors, font_pairings }, req.user.userId);
    if (!updated) {
      // Same response whether the id doesn't exist or belongs to another
      // user - distinguishing the two would confirm to a non-owner that the
      // id exists.
      res.status(404).json({ error: `Brand DNA not found with ID: ${id}` });
      return;
    }
    res.status(200).json({ success: true, brandDna: updated });
  } catch (error: any) {
    console.error('[DNA] Update failed:', error.message);
    res.status(500).json({ error: error.message || 'Internal server error updating brand DNA' });
  }
}
