import { Request, Response, NextFunction } from 'express';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { listAssets, getAssetById, createAsset, getAssetStream } from '../services/asset.service';

const tracer = trace.getTracer('brandcore-asset-controller');

export async function handleListAssets(req: Request, res: Response, next: NextFunction) {
  const { brandDnaId, type, tag, searchQuery, limit, offset, sortBy, sortOrder } = req.query;

  try {
    const result = await listAssets({
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

  try {
    const asset = await getAssetById(id);
    if (!asset) {
      return res.status(404).json({ error: `Asset not found with ID: ${id}` });
    }

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

  try {
    const newAsset = await createAsset({
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

export async function handleDownloadAsset(req: Request, res: Response, next: NextFunction) {
  const { id } = req.params;

  return tracer.startActiveSpan('stream_asset_download', async (span) => {
    span.setAttribute('download.asset_id', id);

    try {
      const asset = await getAssetById(id);
      if (!asset) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Asset not found' });
        span.end();
        return res.status(404).json({ error: `Asset not found with ID: ${id}` });
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
