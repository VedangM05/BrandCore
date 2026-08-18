import { trace, SpanStatusCode, Span } from '@opentelemetry/api';
import { query } from '../db';

const tracer = trace.getTracer('brandcore-project-service');

async function traceSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error: any) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message || 'An error occurred' });
      throw error;
    } finally {
      span.end();
    }
  });
}

export interface ProjectRecord {
  id: string;
  name: string;
  url: string;
  description: string | null;
  colors: string[] | null;
  font: string | null;
  tone: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Creates or refreshes the server-side project record for a (user, url)
 * pair. Called from dna.service.ts after every successful scan - a rescan of
 * the same URL updates the same row (name/brand_dna_id) rather than creating
 * a duplicate, matching the ON CONFLICT (user_id, url) behaviour already
 * used for crawl_results.
 *
 * Deliberately never throws on failure to sync a project row - the
 * crawl_results row (the actual Brand DNA) is the source of truth and is
 * already committed by this point; losing the project-list convenience
 * record shouldn't fail a scan the user is waiting on. Callers should log a
 * warning and continue.
 */
export async function upsertProject(
  userId: string,
  params: { url: string; domain: string; name: string; brandDnaId: string }
): Promise<void> {
  return traceSpan('upsertProject', async (span) => {
    span.setAttribute('project.user_id', userId);
    span.setAttribute('project.url', params.url);
    await query(
      `INSERT INTO projects (user_id, name, url, domain, brand_dna_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, url) DO UPDATE SET
         name = EXCLUDED.name,
         domain = EXCLUDED.domain,
         brand_dna_id = EXCLUDED.brand_dna_id,
         updated_at = NOW()`,
      [userId, params.name, params.url, params.domain, params.brandDnaId]
    );
  });
}

/**
 * Lists a user's projects, each joined to its linked Brand DNA row so the
 * frontend gets everything it needs (colors/font/tone/tagline) in one call.
 * The `id` returned to callers is deliberately the Brand DNA id
 * (`crawl_results.id`), not the `projects` table's own PK - every generation
 * endpoint already resolves brand identity via `resolveBrandDna`, which
 * matches on a `crawl_results` id/url/domain. Reusing that id here means the
 * frontend can pass `activeProject.id` straight into `brandDnaId` with zero
 * changes to creative.service.ts/photoshoot.service.ts/brandDna.service.ts.
 * Projects without a linked Brand DNA yet (shouldn't normally happen - see
 * upsertProject) are excluded rather than returned with a useless id.
 */
export async function listProjects(userId: string): Promise<ProjectRecord[]> {
  return traceSpan('listProjects', async (span) => {
    span.setAttribute('project.user_id', userId);
    const res = await query(
      `SELECT
         cr.id AS id,
         p.name AS name,
         p.url AS url,
         cr.tagline AS description,
         cr.colors AS colors,
         cr.font_pairings AS font,
         cr.tone AS tone,
         p.created_at AS created_at,
         p.updated_at AS updated_at
       FROM projects p
       JOIN crawl_results cr ON cr.id = p.brand_dna_id
       WHERE p.user_id = $1
       ORDER BY p.updated_at DESC`,
      [userId]
    );
    return res.rows;
  });
}

/**
 * Deletes a project record (the workspace-list entry only - not the
 * underlying Brand DNA/crawl_results row, campaigns, or assets, which are
 * independently owned and may still be worth keeping). Scoped to `userId` so
 * a non-owner deleting-by-guessed-id is a silent no-op, matching the
 * ownership pattern used everywhere else (see brandDna.service.ts).
 */
export async function deleteProject(brandDnaId: string, userId: string): Promise<boolean> {
  return traceSpan('deleteProject', async (span) => {
    span.setAttribute('project.brand_dna_id', brandDnaId);
    span.setAttribute('project.user_id', userId);
    const res = await query('DELETE FROM projects WHERE brand_dna_id = $1 AND user_id = $2 RETURNING id', [
      brandDnaId,
      userId,
    ]);
    return (res.rowCount || 0) > 0;
  });
}
