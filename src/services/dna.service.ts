import { trace, SpanStatusCode, Span } from '@opentelemetry/api';
import { query } from '../db';
import { spawn } from 'child_process';
import * as path from 'path';
import { synthesizeBrandDna } from './intelligence.service';

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

export async function runDnaScan(url: string): Promise<DnaScanResult> {
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
      "INSERT INTO crawl_jobs (domain, status) VALUES ($1, 'pending') RETURNING id",
      [domain]
    );
    const jobId = jobRes.rows[0].id;
    span.setAttribute('dna.job_id', jobId);

    try {
      await query("UPDATE crawl_jobs SET status = 'processing', updated_at = NOW() WHERE id = $1", [jobId]);

      const pythonPath = path.join(process.cwd(), '.venv/bin/python');
      const scriptPath = path.join(process.cwd(), 'src/services/crawl_agent.py');

      const processResult = await new Promise<string>((resolve, reject) => {
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

      // Locate output JSON (skip non-JSON log lines)
      const lines = processResult.trim().split('\n');
      let jsonPayload = '';
      for (const line of lines) {
        if (line.trim().startsWith('{') && line.trim().endsWith('}')) {
          jsonPayload = line;
          break;
        }
      }

      if (!jsonPayload) {
        throw new Error('No valid JSON output received from python crawler');
      }

      const parsed: any = JSON.parse(jsonPayload);
      if (!parsed.success) {
        throw new Error(parsed.error || 'Python crawler execution failed');
      }

      // Synthesize Brand DNA properties using single-call intelligence pipeline
      const synthesized = await synthesizeBrandDna(parsed);

      await query(
        `INSERT INTO crawl_results 
        (job_id, domain, url, title, meta_description, markdown_content, logo_url, colors, font_pairings, tone, dom_hierarchy, tagline, mission, audience, value_proposition)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
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
          synthesized.valueProposition
        ]
      );

      await query(
        "UPDATE crawl_jobs SET status = 'completed', pages_crawled = 1, updated_at = NOW() WHERE id = $1",
        [jobId]
      );

      return {
        success: true,
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
