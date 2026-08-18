import { trace, SpanStatusCode, Span } from '@opentelemetry/api';
import { query } from '../db';
import { spawn } from 'child_process';
import * as path from 'path';
import { synthesizeBrandDna } from './intelligence.service';
import { upsertProject } from './project.service';
import { domainCrawlLimiter } from './domainRateLimiter.service';
import { enqueueKnowledgeIndexing } from './knowledgeBase.service';

const tracer = trace.getTracer('brandcore-dna-service');

async function traceSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error: any) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message || 'An error occurred during service execution',
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

export interface DnaScanResult {
  success: boolean;
  id: string;
  url: string;
  title: string;
  meta_description: string;
  markdown: string;
  links: string[];
  logo_url: string;
  colors: string[];
  font_pairings: string;
  tone: string;
  dom_hierarchy: any;
  tagline: string;
  mission: string;
  audience: string;
  value_proposition: string;
}

export async function runDnaScan(url: string, userId: string): Promise<DnaScanResult> {
  return traceSpan('runDnaScan', async (span) => {
    span.setAttribute('dna.url', url);

    let domain = 'unknown';
    try {
      const parsedUrl = new URL(url);
      domain = parsedUrl.hostname;
    } catch (err) {
      throw new Error(`Invalid URL format: ${url}`);
    }
    span.setAttribute('dna.domain', domain);

    const jobRes = await query(
      "INSERT INTO crawl_jobs (domain, status, user_id) VALUES ($1, 'pending', $2) RETURNING id",
      [domain, userId]
    );
    const jobId = jobRes.rows[0].id;
    span.setAttribute('dna.job_id', jobId);

    try {
      await query("UPDATE crawl_jobs SET status = 'processing', updated_at = NOW() WHERE id = $1", [jobId]);

      const pythonPath = path.join(process.cwd(), '.venv/bin/python');
      const scriptPath = path.join(process.cwd(), 'src/services/crawl_agent.py');

      // Per-domain concurrency cap (spec Fix #6) - queues rather than
      // rejects if this domain already has the max in-flight crawls, so
      // e.g. two users scanning the same site around the same time don't
      // hammer it with simultaneous requests. See domainRateLimiter.service.ts.
      const releaseCrawlSlot = await domainCrawlLimiter.acquire(domain);
      let processResult: string;
      try {
        processResult = await new Promise<string>((resolve, reject) => {
          const pyProcess = spawn(pythonPath, [scriptPath, url]);
          let stdout = '';
          let stderr = '';

          pyProcess.stdout.on('data', (data) => {
            stdout += data.toString();
          });

          pyProcess.stderr.on('data', (data) => {
            stderr += data.toString();
          });

          pyProcess.on('close', (code) => {
            if (stderr) {
              console.log(`[Python stderr]\n${stderr}`);
            }
            if (code !== 0) {
              reject(new Error(`Python process exited with code ${code}. Stderr: ${stderr || 'No stderr output'}`));
            } else {
              resolve(stdout);
            }
          });

          pyProcess.on('error', (err) => {
            reject(err);
          });
        });
      } finally {
        releaseCrawlSlot();
      }

      // Locate output JSON payload (scan from bottom up to locate crawler result)
      const lines = processResult.trim().split('\n');
      let parsed: any = null;
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('{') && line.endsWith('}')) {
          try {
            const candidate = JSON.parse(line);
            if (candidate && typeof candidate.success !== 'undefined') {
              parsed = candidate;
              break;
            }
          } catch {
            // Ignore non-JSON or partial log lines
          }
        }
      }

      if (!parsed) {
        throw new Error('No valid JSON output received from python crawler');
      }

      if (!parsed.success) {
        throw new Error(parsed.error || 'Python crawler execution failed');
      }

      // Synthesize Brand DNA properties using single-call intelligence pipeline
      const synthesized = await synthesizeBrandDna(parsed);

      const upsertRes = await query(
        `INSERT INTO crawl_results
        (job_id, domain, url, title, meta_description, markdown_content, logo_url, colors, font_pairings, tone, dom_hierarchy, tagline, mission, audience, value_proposition, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (user_id, url) DO UPDATE SET
          job_id = EXCLUDED.job_id,
          domain = EXCLUDED.domain,
          title = EXCLUDED.title,
          meta_description = EXCLUDED.meta_description,
          markdown_content = EXCLUDED.markdown_content,
          logo_url = EXCLUDED.logo_url,
          colors = EXCLUDED.colors,
          font_pairings = EXCLUDED.font_pairings,
          tone = EXCLUDED.tone,
          dom_hierarchy = EXCLUDED.dom_hierarchy,
          tagline = EXCLUDED.tagline,
          mission = EXCLUDED.mission,
          audience = EXCLUDED.audience,
          value_proposition = EXCLUDED.value_proposition
        RETURNING id`,
        [
          jobId,
          domain,
          url,
          parsed.title,
          parsed.meta_description,
          parsed.markdown,
          parsed.logo_url,
          synthesized.colors,
          synthesized.fontPairing,
          synthesized.tone,
          JSON.stringify(parsed.dom_hierarchy),
          synthesized.tagline,
          synthesized.mission,
          synthesized.audience,
          synthesized.valueProposition,
          userId
        ]
      );
      const brandDnaId = upsertRes.rows[0].id;

      await query(
        "UPDATE crawl_jobs SET status = 'completed', pages_crawled = 1, updated_at = NOW() WHERE id = $1",
        [jobId]
      );

      // Sync the server-side project record so it survives across
      // browsers/devices instead of living only in frontend localStorage
      // (see project.service.ts). Deliberately non-fatal: the crawl_results
      // row above is the actual Brand DNA and is already committed, so a
      // failure here shouldn't fail a scan the user is waiting on.
      try {
        await upsertProject(userId, {
          url,
          domain,
          name: parsed.title || domain,
          brandDnaId,
        });
      } catch (projectErr: any) {
        console.error('[DNA] Project sync failed (non-fatal):', projectErr.message);
      }

      // Enqueue Knowledge Base indexing (spec Phase B) as a background job -
      // chunking + embedding a whole site is several sequential Gemini
      // calls (see embedding.service.ts) and shouldn't block the scan
      // response. Non-fatal for the same reason as the project sync above.
      try {
        await enqueueKnowledgeIndexing(brandDnaId);
      } catch (indexErr: any) {
        console.error('[DNA] Knowledge Base indexing enqueue failed (non-fatal):', indexErr.message);
      }

      return {
        success: true,
        id: brandDnaId,
        url: url,
        title: parsed.title,
        meta_description: parsed.meta_description,
        markdown: parsed.markdown,
        links: parsed.links,
        logo_url: parsed.logo_url,
        colors: synthesized.colors,
        font_pairings: synthesized.fontPairing,
        tone: synthesized.tone,
        dom_hierarchy: parsed.dom_hierarchy,
        tagline: synthesized.tagline,
        mission: synthesized.mission,
        audience: synthesized.audience,
        value_proposition: synthesized.valueProposition
      };
    } catch (err: any) {
      await query(
        "UPDATE crawl_jobs SET status = 'failed', error_reason = $1, updated_at = NOW() WHERE id = $2",
        [err.message || 'Unknown crawl error', jobId]
      );
      throw err;
    }
  });
}

export interface BrandDnaUpdate {
  title?: string;
  tagline?: string;
  tone?: string;
  colors?: string[];
  font_pairings?: string;
}

export interface BrandDnaRecord {
  id: string;
  title: string;
  tagline: string | null;
  tone: string | null;
  colors: string[];
  font_pairings: string | null;
}

/**
 * Applies user corrections on top of the auto-extracted Business DNA
 * (colors/font/tone/name/tagline only - the deeper synthesized fields like
 * mission/audience/value_proposition aren't surfaced in the DNA editor UI,
 * so they're left untouched here). Reviewers of comparable tools (e.g.
 * Pomelli) consistently note the auto-extraction gets most brands ~80%
 * right and the tool is only trustworthy once a human can correct the rest -
 * this is that correction path. Every downstream generation call resolves
 * brand identity through this same row (see brandDna.service.ts), so an edit
 * here immediately changes what gets generated next, no re-scan required.
 *
 * `userId` is enforced as an ownership check, not just a filter: every query
 * below includes `AND user_id = $userId`, so a row belonging to another user
 * (or with no recorded owner) returns null exactly like a nonexistent id
 * would - the controller responds 404 either way, rather than a 403 that
 * would confirm the id exists for a non-owner.
 */
export async function updateBrandDna(id: string, updates: BrandDnaUpdate, userId: string): Promise<BrandDnaRecord | null> {
  return traceSpan('updateBrandDna', async (span) => {
    span.setAttribute('dna.id', id);

    const setClauses: string[] = [];
    const params: any[] = [];

    if (updates.title !== undefined) {
      params.push(updates.title);
      setClauses.push(`title = $${params.length}`);
    }
    if (updates.tagline !== undefined) {
      params.push(updates.tagline);
      setClauses.push(`tagline = $${params.length}`);
    }
    if (updates.tone !== undefined) {
      params.push(updates.tone);
      setClauses.push(`tone = $${params.length}`);
    }
    if (updates.colors !== undefined) {
      params.push(updates.colors);
      setClauses.push(`colors = $${params.length}`);
    }
    if (updates.font_pairings !== undefined) {
      params.push(updates.font_pairings);
      setClauses.push(`font_pairings = $${params.length}`);
    }

    if (setClauses.length === 0) {
      const existing = await query(
        'SELECT id, title, tagline, tone, colors, font_pairings FROM crawl_results WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
      return existing.rows[0] || null;
    }

    params.push(id, userId);
    const res = await query(
      `UPDATE crawl_results SET ${setClauses.join(', ')} WHERE id = $${params.length - 1} AND user_id = $${params.length}
       RETURNING id, title, tagline, tone, colors, font_pairings`,
      params
    );

    return res.rows[0] || null;
  });
}
