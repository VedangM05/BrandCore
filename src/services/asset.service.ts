import { trace, SpanStatusCode } from '@opentelemetry/api';
import { query } from '../db';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

const tracer = trace.getTracer('brandcore-asset-service');

// Every real asset file this app ever creates lives under this directory
// (see UPLOADS_DIR in photoshoot.service.ts, which this deliberately
// mirrors rather than imports, to keep this file's only filesystem
// contract self-contained and enforced at the one place that actually
// reads bytes off disk). getAssetStream() below refuses to serve anything
// outside it - see that function's docstring for why this exists.
const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');

/**
 * Throws a 404 (never 403 - see the callers' own docstrings on why) unless
 * `filePath` resolves inside UPLOADS_ROOT. Shared by both getAssetStream
 * (read) and updateAsset (write) below - both were independently
 * exploitable arbitrary-file read/write vulnerabilities before this
 * existed, via the same root cause (see getAssetStream's docstring), so
 * this is enforced once and reused rather than duplicated per call site
 * where it could drift or get missed on a future write path.
 */
function assertPathWithinUploads(filePath: string): string {
  const resolved = path.resolve(filePath);
  if (resolved !== UPLOADS_ROOT && !resolved.startsWith(UPLOADS_ROOT + path.sep)) {
    const err: any = new Error('Asset file not found');
    err.status = 404;
    throw err;
  }
  return resolved;
}

export interface AssetRecord {
  id: string;
  userId: string | null;
  brandDnaId: string | null;
  campaignId: string | null;
  name: string;
  type: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  tags: string[];
  metaData: Record<string, any>;
  createdAt: Date;
}

export interface ListAssetsOptions {
  userId: string;
  brandDnaId?: string;
  type?: string;
  tag?: string;
  searchQuery?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface ListAssetsResult {
  assets: AssetRecord[];
  total: number;
  limit: number;
  offset: number;
}

function mapAssetRow(row: any): AssetRecord {
  return {
    id: row.id,
    userId: row.user_id,
    brandDnaId: row.brand_dna_id,
    campaignId: row.campaign_id,
    name: row.name,
    type: row.type,
    filePath: row.file_path,
    mimeType: row.mime_type,
    fileSize: parseInt(row.file_size, 10),
    tags: row.tags || [],
    metaData: row.meta_data || {},
    createdAt: row.created_at,
  };
}

/**
 * Searches and lists assets using indexed multi-attribute database query filters.
 * Always scoped to `options.userId` - see handleListAssets in asset.controller.ts.
 */
export async function listAssets(options: ListAssetsOptions): Promise<ListAssetsResult> {
  return tracer.startActiveSpan('db_asset_search', async (span) => {
    span.setAttribute('search.brand_dna_id', options.brandDnaId || 'all');
    span.setAttribute('search.type', options.type || 'all');
    span.setAttribute('search.tag', options.tag || 'all');

    const limit = options.limit || 100;
    const offset = options.offset || 0;
    const sortBy = options.sortBy === 'name' ? 'name' : 'created_at';
    const sortOrder = options.sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const conditions: string[] = [];
    const params: any[] = [];

    params.push(options.userId);
    conditions.push(`user_id = $${params.length}`);

    if (options.brandDnaId) {
      params.push(options.brandDnaId);
      conditions.push(`brand_dna_id = $${params.length}`);
    }

    if (options.type) {
      params.push(options.type);
      conditions.push(`type = $${params.length}`);
    }

    if (options.tag) {
      params.push(options.tag);
      conditions.push(`$${params.length} = ANY(tags)`);
    }

    if (options.searchQuery && options.searchQuery.trim().length > 0) {
      params.push(`%${options.searchQuery.trim()}%`);
      conditions.push(`(name ILIKE $${params.length} OR meta_data::text ILIKE $${params.length})`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Count query
    const countSql = `SELECT COUNT(*) FROM assets ${whereClause}`;
    const countRes = await query(countSql, params);
    const total = parseInt(countRes.rows[0].count, 10);

    // Data query
    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const dataSql = `
      SELECT id, user_id, brand_dna_id, campaign_id, name, type, file_path, mime_type, file_size, tags, meta_data, created_at
      FROM assets
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const dataRes = await query(dataSql, params);
    const assets: AssetRecord[] = dataRes.rows.map(mapAssetRow);

    span.setAttribute('search.result_count', assets.length);
    span.setStatus({ code: SpanStatusCode.OK });

    return { assets, total, limit, offset };
  });
}

/**
 * Fetches a single asset by ID, regardless of owner - callers (asset.controller.ts)
 * are responsible for comparing the returned `userId` against the requesting
 * user and responding 404 on mismatch. Kept owner-agnostic here so internal
 * callers (e.g. the generation pipeline creating an asset) don't need a
 * userId just to check existence.
 */
export async function getAssetById(id: string): Promise<AssetRecord | null> {
  return tracer.startActiveSpan('db_asset_lookup', async (span) => {
    span.setAttribute('asset.id', id);

    const res = await query(
      `SELECT id, user_id, brand_dna_id, campaign_id, name, type, file_path, mime_type, file_size, tags, meta_data, created_at
       FROM assets WHERE id = $1`,
      [id]
    );

    if (res.rows.length === 0) {
      span.setStatus({ code: SpanStatusCode.OK });
      return null;
    }

    span.setStatus({ code: SpanStatusCode.OK });
    return mapAssetRow(res.rows[0]);
  });
}

/**
 * Inserts asset record into database.
 */
export async function createAsset(asset: Omit<AssetRecord, 'id' | 'createdAt'>): Promise<AssetRecord> {
  return tracer.startActiveSpan('db_asset_insert', async (span) => {
    span.setAttribute('asset.name', asset.name);
    span.setAttribute('asset.type', asset.type);

    // Reject at creation time, not just at read/write time (getAssetStream/
    // updateAsset) - every legitimate caller (photoshoot.service.ts) already
    // only ever passes a path under its own UPLOADS_DIR, so this is a no-op
    // for real usage and only blocks the exploit path
    // (POST /api/assets accepts `filePath` directly from the request body -
    // see getAssetStream's docstring for the full vulnerability this
    // closes). Failing here means a bad path is never even persisted to
    // the assets table in the first place.
    assertPathWithinUploads(asset.filePath);

    const res = await query(
      `INSERT INTO assets
       (user_id, brand_dna_id, campaign_id, name, type, file_path, mime_type, file_size, tags, meta_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, created_at`,
      [
        asset.userId,
        asset.brandDnaId,
        asset.campaignId,
        asset.name,
        asset.type,
        asset.filePath,
        asset.mimeType,
        asset.fileSize,
        asset.tags,
        JSON.stringify(asset.metaData)
      ]
    );

    const id = res.rows[0].id;
    const createdAt = res.rows[0].created_at;

    span.setAttribute('asset.id', id);
    span.setStatus({ code: SpanStatusCode.OK });

    return {
      ...asset,
      id,
      createdAt
    };
  });
}

export interface UpdateAssetInput {
  fileBuffer?: Buffer;
  mimeType?: string;
  metaData?: Record<string, any>;
}

/**
 * Updates an existing asset in place: overwrites the file on disk at its
 * existing file_path (keeping the same asset id/URL) when new image bytes
 * are supplied, and shallow-merges metaData into the existing JSONB column
 * (e.g. editor layer state) rather than replacing it outright.
 *
 * Ownership is enforced by the caller (asset.controller.ts fetches and
 * compares userId before calling this) rather than here, so this function
 * doesn't need a userId param - it always operates on a specific row it's
 * already been authorized to touch.
 */
export async function updateAsset(id: string, input: UpdateAssetInput): Promise<AssetRecord | null> {
  return tracer.startActiveSpan('db_asset_update', async (span) => {
    span.setAttribute('asset.id', id);

    const existing = await getAssetById(id);
    if (!existing) {
      span.setStatus({ code: SpanStatusCode.OK });
      return null;
    }

    if (input.fileBuffer) {
      // Same UPLOADS_ROOT confinement as getAssetStream (read) - without
      // this, an asset created via the unvalidated POST /api/assets
      // `filePath` field (see getAssetStream's docstring) could point
      // anywhere on disk, and this write would overwrite it with
      // attacker-controlled bytes - an arbitrary file *write*, not just a
      // read, since PUT /api/assets/:id lets any owner supply new image
      // bytes for their own asset.
      const targetPath = assertPathWithinUploads(existing.filePath);
      fs.writeFileSync(targetPath, input.fileBuffer);
    }

    const fileSize = input.fileBuffer ? input.fileBuffer.length : existing.fileSize;
    const mimeType = input.mimeType || existing.mimeType;

    const res = await query(
      `UPDATE assets
       SET mime_type = $1,
           file_size = $2,
           meta_data = COALESCE(meta_data, '{}'::jsonb) || $3::jsonb
       WHERE id = $4
       RETURNING id, user_id, brand_dna_id, campaign_id, name, type, file_path, mime_type, file_size, tags, meta_data, created_at`,
      [mimeType, fileSize, JSON.stringify(input.metaData || {}), id]
    );

    if (res.rows.length === 0) {
      span.setStatus({ code: SpanStatusCode.OK });
      return null;
    }

    span.setStatus({ code: SpanStatusCode.OK });
    return mapAssetRow(res.rows[0]);
  });
}

/**
 * Creates high-performance streaming read pipeline for file downloads.
 *
 * SECURITY: `filePath` must resolve inside UPLOADS_ROOT. This was a real,
 * exploitable arbitrary-file-read vulnerability before this check existed -
 * `filePath` traces back to caller-controlled input via two independent
 * paths: `POST /api/assets`'s `filePath` body field is stored verbatim with
 * no validation (asset.controller.ts's `handleCreateAsset`), and
 * `PUT /api/assets/:id`'s `metaData` is merged into `assets.meta_data` as a
 * raw JSONB union with no key filtering (`updateAsset` below) - so a caller
 * could set `metaData.rawBackgroundPath` to an arbitrary path on any asset
 * they legitimately own, then hit `GET /api/assets/:id/raw-background` to
 * read it. Either path let an authenticated user (any self-registered
 * account, no special privileges needed) read arbitrary files off the
 * server's filesystem as the Node process's own OS user - including `.env`
 * (DB credentials, JWT secrets, every API key this app holds). Enforced
 * here, at the one place that actually turns a path into file bytes,
 * rather than only at each individual caller - a defense that still holds
 * even if a future caller reintroduces an unvalidated path some other way.
 */
export async function getAssetStream(filePath: string): Promise<{ stream: Readable; fileSize: number }> {
  return tracer.startActiveSpan('s3_data_connection', async (span) => {
    span.setAttribute('s3.file_path', filePath);

    // 404, not 403 - matches this app's own "unowned/invalid = not found"
    // pattern elsewhere (asset.controller.ts's loadOwnedAsset,
    // brandDna.service.ts) rather than confirming to an attacker that a
    // path exists but is merely forbidden. assertPathWithinUploads throws
    // with .status = 404 already, so a rejection here surfaces exactly
    // like a missing file to the caller.
    const resolved = assertPathWithinUploads(filePath);

    // Local filesystem stream path (uploads/ - see saveBufferToUploads in
    // photoshoot.service.ts). An in-memory-buffer lookup used to be checked
    // first here for "fast test streaming" but nothing anywhere ever
    // populated it (tests write real files to disk instead) - removed.
    if (fs.existsSync(resolved)) {
      const stats = fs.statSync(resolved);
      const stream = fs.createReadStream(resolved);
      span.setAttribute('s3.bytes', stats.size);
      span.setStatus({ code: SpanStatusCode.OK });
      return { stream, fileSize: stats.size };
    }

    // Previously fell back to a fabricated placeholder buffer here
    // ("Asset Content Stream for <name>") and reported it as a normal 200
    // download - meaning a genuinely missing/deleted file (a wiped Docker
    // volume, a manual deletion, a bug elsewhere) silently served fake
    // content as if it were the user's real image, instead of surfacing the
    // data loss. Both callers (asset.controller.ts) already wrap this in
    // try/catch -> next(error), so throwing here correctly reaches the
    // client as a real error instead of a corrupted "successful" download.
    span.setStatus({ code: SpanStatusCode.ERROR, message: 'Asset file missing from disk' });
    const notFoundError: any = new Error(`Asset file not found on disk: ${path.basename(filePath)}`);
    notFoundError.status = 404;
    throw notFoundError;
  });
}
