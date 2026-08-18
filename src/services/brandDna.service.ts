import { query } from '../db';

export interface ResolvedBrandDna {
  brandDna: any;
  validDnaId: string | null;
}

/**
 * Resolves a brand DNA row from a caller-supplied identifier, which may be a
 * crawl_results UUID, the scanned URL, or a bare domain. Falls back to the
 * most recently crawled brand only when the identifier is missing or fails
 * to resolve at all - never falls back just because the resolved row looks
 * incomplete, since that would silently swap in a different brand's DNA for
 * a caller that supplied a valid, specific identifier.
 *
 * `userId` scopes every lookup to rows owned by that user. This closes a real
 * IDOR hole: before this, any authenticated user could generate against (and
 * read the crawled content of) any other user's scanned brand just by
 * knowing/guessing its id, url, or domain. A row with no recorded owner
 * (user_id IS NULL - pre-migration data) is never matched, including by the
 * "latest" fallback: it's treated as inaccessible rather than as a shared
 * default, since silently granting access to unowned legacy rows would just
 * recreate the same hole for that subset of data.
 *
 * Shared by creative.service.ts and photoshoot.service.ts so both the ad-copy
 * pipeline and the image-generation pipeline resolve brand identity the same
 * way.
 */
export async function resolveBrandDna(brandDnaId: string | undefined | null, userId: string): Promise<ResolvedBrandDna> {
  let brandDna: any = {};
  let validDnaId: string | null = null;

  if (brandDnaId) {
    try {
      let dnaRes = await query(
        'SELECT * FROM crawl_results WHERE (id::text = $1 OR url = $1 OR domain = $1) AND user_id = $2 ORDER BY created_at DESC LIMIT 1',
        [brandDnaId, userId]
      );
      if (dnaRes.rows.length === 0 && (brandDnaId.includes('http') || brandDnaId.includes('.'))) {
        const domain = brandDnaId.replace(/https?:\/\/(www\.)?/, '').split('/')[0];
        dnaRes = await query('SELECT * FROM crawl_results WHERE domain = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1', [domain, userId]);
      }
      if (dnaRes.rows.length > 0) {
        brandDna = dnaRes.rows[0];
        validDnaId = brandDna.id;
      }
    } catch (err) {
      // Proceed to fallback query if format check fails
    }
  }

  if (!validDnaId) {
    try {
      const latestRes = await query('SELECT * FROM crawl_results WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [userId]);
      if (latestRes.rows.length > 0) {
        brandDna = latestRes.rows[0];
        validDnaId = brandDna.id;
      }
    } catch (err) {}
  }

  return { brandDna, validDnaId };
}
