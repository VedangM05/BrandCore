import { Request, Response, NextFunction } from 'express';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { listAssets, getAssetById, createAsset, getAssetStream, updateAsset, AssetRecord } from '../services/asset.service';

const DATA_URL_PATTERN = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB decoded - generous for a full-res canvas export

const tracer = trace.getTracer('brandcore-asset-controller');

/**
 * Fetches an asset and verifies it belongs to the requesting user, in one
 * place so every route below applies the same rule. Returns null (and has
 * already written the 404 response) on either "doesn't exist" or "exists but
 * belongs to someone else" - deliberately the same response for both, so a
 * non-owner probing ids can't distinguish "not found" from "found, not
 * yours". A legacy asset with no recorded owner (user_id IS NULL, from
 * before this ownership model existed) is also denied rather than treated as
 * public, for the same reason described in brandDna.service.ts.
 */
async function loadOwnedAsset(id: string, userId: string, res: Response): Promise<AssetRecord | null> {
  const asset = await getAssetById(id);
  if (!asset || asset.userId !== userId) {
    res.status(404).json({ error: `Asset not found with ID: ${id}` });
    return null;
  }
  return asset;
}

export async function handleListAssets(req: Request, res: Response, next: NextFunction) {
  const { brandDnaId, type, tag, searchQuery, limit, offset, sortBy, sortOrder } = req.query;

  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const result = await listAssets({
      userId: req.user.userId,
      brandDnaId: brandDnaId as string,
      type: type as string,
      tag: tag as string,
      searchQuery: searchQuery as string,
      limit: limit ? parseInt(limit as string, 10) : 100,
      offset: offset ? parseInt(offset as string, 10) : 0,
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'ASC' | 'DESC'
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function handleGetAsset(req: Request, res: Response, next: NextFunction) {
  const { id } = req.params;
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const asset = await loadOwnedAsset(id, req.user.userId, res);
    if (!asset) return;

    return res.status(200).json({ success: true, asset });
  } catch (error) {
    next(error);
  }
}

export async function handleCreateAsset(req: Request, res: Response, next: NextFunction) {
  const { brandDnaId, campaignId, name, type, filePath, mimeType, fileSize, tags, metaData } = req.body;

  if (!brandDnaId || !name || !type || !filePath) {
    return res.status(400).json({ error: 'Missing required parameters: brandDnaId, name, type, or filePath' });
  }
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const newAsset = await createAsset({
      userId: req.user.userId,
      brandDnaId,
      campaignId: campaignId || null,
      name,
      type,
      filePath,
      mimeType: mimeType || 'image/png',
      fileSize: fileSize || 1024,
      tags: tags || [],
      metaData: metaData || {}
    });

    return res.status(201).json({ success: true, asset: newAsset });
  } catch (error) {
    next(error);
  }
}

export async function handleUpdateAsset(req: Request, res: Response, next: NextFunction) {
  const { id } = req.params;
  const { imageDataUrl, metaData } = req.body;

  if (!imageDataUrl && !metaData) {
    return res.status(400).json({ error: 'Nothing to update: provide imageDataUrl and/or metaData' });
  }
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let fileBuffer: Buffer | undefined;
  let mimeType: string | undefined;

  if (imageDataUrl) {
    const match = DATA_URL_PATTERN.exec(imageDataUrl);
    if (!match) {
      return res.status(400).json({ error: 'imageDataUrl must be a base64 data URL (image/png, image/jpeg, or image/webp)' });
    }
    mimeType = match[1];
    fileBuffer = Buffer.from(match[2], 'base64');
    if (fileBuffer.length === 0) {
      return res.status(400).json({ error: 'Decoded image is empty' });
    }
    if (fileBuffer.length > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: `Edited image exceeds the ${MAX_IMAGE_BYTES / (1024 * 1024)}MB limit` });
    }
  }

  try {
    const owned = await loadOwnedAsset(id, req.user.userId, res);
    if (!owned) return;

    const updated = await updateAsset(id, { fileBuffer, mimeType, metaData });
    if (!updated) {
      return res.status(404).json({ error: `Asset not found with ID: ${id}` });
    }
    return res.status(200).json({ success: true, asset: updated });
  } catch (error) {
    next(error);
  }
}

/**
 * Serves the text-free background image stashed alongside a campaign-post or
 * carousel-slide asset (meta_data.rawBackgroundPath - see photoshoot.service.ts),
 * so the AssetEditor can be reopened from the Asset Library with the headline
 * as an independent, still-movable text layer instead of already-flattened
 * pixels. Assets with no stored raw background (single photoshoot images,
 * which are never text-composited, or assets created before this existed)
 * 404 - callers should fall back to the asset's own flattened file/download.
 */
export async function handleGetAssetRawBackground(req: Request, res: Response, next: NextFunction) {
  const { id } = req.params;
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const asset = await loadOwnedAsset(id, req.user.userId, res);
    if (!asset) return;

    const rawBackgroundPath = asset.metaData?.rawBackgroundPath;
    if (!rawBackgroundPath) {
      return res.status(404).json({ error: 'No raw background stored for this asset' });
    }

    const { stream, fileSize } = await getAssetStream(rawBackgroundPath);
    res.setHeader('Content-Type', asset.mimeType || 'image/jpeg');
    res.setHeader('Content-Length', fileSize.toString());
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
}

export async function handleDownloadAsset(req: Request, res: Response, next: NextFunction) {
  const { id } = req.params;

  return tracer.startActiveSpan('stream_asset_download', async (span) => {
    span.setAttribute('download.asset_id', id);

    if (!req.user) {
      span.end();
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const asset = await loadOwnedAsset(id, req.user.userId, res);
      if (!asset) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Asset not found or not owned by requester' });
        span.end();
        return;
      }

      const { stream, fileSize } = await getAssetStream(asset.filePath);

      res.setHeader('Content-Type', asset.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', fileSize.toString());
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(asset.name)}"`);

      span.setStatus({ code: SpanStatusCode.OK });
      span.end();

      stream.pipe(res);
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
      next(error);
    }
  });
}
