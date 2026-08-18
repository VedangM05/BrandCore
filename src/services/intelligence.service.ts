import { z } from 'zod';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { callGroqJSON, GROQ_TEXT_MODELS } from './groq.service';

const tracer = trace.getTracer('brandcore-intelligence-service');

// Strict Zod schema for unified Brand DNA Positioning Matrix
export const BrandDnaSchema = z.object({
  brandName: z.string().min(1),
  tagline: z.string().min(1),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2),
  fontPairing: z.string().min(1),
  tone: z.string().min(1),
  mission: z.string().min(1),
  audience: z.string().min(1),
  valueProposition: z.string().min(1)
});

export type BrandDna = z.infer<typeof BrandDnaSchema>;

export interface CrawlData {
  url: string;
  title: string;
  meta_description: string;
  markdown: string;
  logo_url: string;
  colors: string[];
  font_pairings: string;
  tone: string;
  dom_hierarchy: any;
}

/**
 * Synthesizes crawled text, headings, and visual attributes into a
 * Zod-validated Brand DNA model. Performs a real LLM call chain via Groq
 * (HANDOFF.md §21 - previously Gemini) if GROQ_API_KEY is configured,
 * otherwise falls back to a deterministic, local heuristic compiler.
 *
 * Unlike the old Gemini version, this doesn't use a provider-specific
 * structured-output schema (Gemini's `responseSchema` isn't something
 * Groq's OpenAI-compatible API offers) - instead it asks for JSON mode
 * (see groq.service.ts) and validates the parsed result against
 * `BrandDnaSchema` itself, exactly like every other JSON-mode call site in
 * this codebase (creative.service.ts) already does. A validation failure
 * (malformed JSON, a missing/invalid field) is treated the same as an
 * outright API failure - fall back to the local heuristic compiler rather
 * than surface a half-synthesized Brand DNA.
 */
export async function synthesizeBrandDna(crawlData: CrawlData): Promise<BrandDna> {
  return tracer.startActiveSpan('brand_intelligence_synthesis', async (span) => {
    span.setAttribute('dna.url', crawlData.url);
    span.setAttribute('dna.title', crawlData.title);

    const apiKey = process.env.GROQ_API_KEY;

    if (apiKey) {
      span.setAttribute('intelligence.execution_mode', 'llm');

      return tracer.startActiveSpan('groq_api_request', async (llmSpan) => {
        llmSpan.setAttribute('llm.provider', 'groq');

        const prompt = `
You are a Brand Intelligence engine for BrandCore.
Analyze the following crawled website metadata, headings, paragraphs, and visual attributes to synthesize a unified brand positioning matrix.

URL: ${crawlData.url}
Title: ${crawlData.title}
Meta Description: ${crawlData.meta_description}
Colors: ${JSON.stringify(crawlData.colors)}
Typography: ${crawlData.font_pairings}
Initial Tone: ${crawlData.tone}

DOM Hierarchy / Content:
${JSON.stringify(crawlData.dom_hierarchy)}

Website Body Markdown (excerpt):
${crawlData.markdown.slice(0, 4000)}

Respond ONLY with a valid JSON object (no markdown, no code blocks) matching this structure:
{
  "brandName": "Short brand name",
  "tagline": "A compelling, catchy brand tagline",
  "colors": ["Hex code #1", "Hex code #2", "etc."],
  "fontPairing": "Header Font & Body Font pairings",
  "tone": "Brief description of brand voice and tone",
  "mission": "Unified core mission statement of the brand",
  "audience": "Primary target audience description",
  "valueProposition": "A concise value proposition outlining core benefit"
}
`;

        // Rough character-to-token estimate for logging only (Groq's free
        // tier has no real dollar cost - see creative.service.ts's note on
        // estimatedCostUsd for why this is kept as a usage proxy, not a
        // real bill).
        const inputTokens = Math.ceil(prompt.length / 4);

        const validated = await callGroqJSON<BrandDna>(prompt, {
          models: GROQ_TEXT_MODELS,
          temperature: 0.4,
          logLabel: `brand DNA synthesis for ${crawlData.title || crawlData.url}`,
          validate: (parsed) => {
            const result = BrandDnaSchema.safeParse(parsed);
            return result.success ? result.data : null;
          },
        });

        if (validated) {
          const outputTokens = Math.ceil(JSON.stringify(validated).length / 4);
          console.log(`[LLM COST] Input Tokens: ${inputTokens}, Output Tokens: ${outputTokens} (Groq free tier - $0 real cost)`);
          llmSpan.setAttribute('llm.input_tokens', inputTokens);
          llmSpan.setAttribute('llm.output_tokens', outputTokens);
          llmSpan.setStatus({ code: SpanStatusCode.OK });
          span.setStatus({ code: SpanStatusCode.OK });
          llmSpan.end();
          return validated;
        }

        // No GROQ_API_KEY at call time (race with env reload), every model
        // failed, or the parsed JSON didn't validate against the schema -
        // fall back to the local compiler rather than crash the scan.
        console.warn('[Intelligence] Groq synthesis failed or returned invalid data. Falling back to local heuristic compiler.');
        llmSpan.setStatus({ code: SpanStatusCode.ERROR, message: 'Groq synthesis failed or returned invalid data' });
        llmSpan.end();
        const fallbackVal = executeLocalFallback(crawlData);
        span.setStatus({ code: SpanStatusCode.OK });
        return fallbackVal;
      });
    } else {
      // Execution mode is fallback
      span.setAttribute('intelligence.execution_mode', 'local_fallback');
      console.log('[Intelligence] GROQ_API_KEY not configured. Executing local heuristic synthesis compiler.');

      const validated = executeLocalFallback(crawlData);

      console.log(`[LLM COST] Input Tokens: 0, Output Tokens: 0 (Local Heuristics Fallback)`);
      span.setStatus({ code: SpanStatusCode.OK });
      return validated;
    }
  });
}

function executeLocalFallback(crawlData: CrawlData): BrandDna {
  // Direct text/keyword-based synthesis compiler matching Zod specifications
  const rawTitle = crawlData.title || '';
  const cleanTitle = rawTitle.split(/[-|•]/)[0].trim() || 'BrandCore Partner';

  // Tagline extraction
  let tagline = 'Empowering modern business growth and innovation.';
  if (crawlData.meta_description) {
    // Take first sentence of meta description if suitable
    const parts = crawlData.meta_description.split(/[.!?]/);
    if (parts[0] && parts[0].trim().length > 10) {
      tagline = parts[0].trim();
      if (!tagline.endsWith('.')) tagline += '.';
    }
  } else if (crawlData.dom_hierarchy && crawlData.dom_hierarchy.length > 0) {
    // Find first paragraph or heading text
    for (const item of crawlData.dom_hierarchy) {
      if (item.tag === 'p' && item.text && item.text.length > 15) {
        tagline = item.text.slice(0, 100).trim();
        if (!tagline.endsWith('.')) tagline += '.';
        break;
      }
    }
  }

  // Ensure colors format exactly matches hex string regex
  const colors = (crawlData.colors || []).map(c => {
    const matched = c.match(/^#[0-9a-fA-F]{6}$/);
    return matched ? c : '#4f46e5';
  });

  while (colors.length < 2) {
    colors.push(colors.length === 0 ? '#4f46e5' : '#f97316');
  }

  // Mission
  let mission = `To deliver state-of-the-art visual and functional solutions that enhance core workspace features for ${cleanTitle}.`;
  if (crawlData.meta_description) {
    mission = `To achieve the brand purpose: ${crawlData.meta_description.trim()}`;
  }

  // Audience
  let audience = 'Tech-savvy developers, design agencies, and enterprise growth teams.';
  if (crawlData.tone.includes('Friendly')) {
    audience = 'Creative communities, collaborative teams, and values-driven individuals.';
  } else if (crawlData.tone.includes('Creative')) {
    audience = 'Designers, artists, content creators, and brand planners.';
  }

  // Value Proposition
  const valueProposition = `Synthesizing ${cleanTitle}'s core visuals, typographic pairings, and verbal tones into high-converting reusable templates and structures.`;

  const parsed = {
    brandName: cleanTitle,
    tagline: tagline.slice(0, 255),
    colors: colors,
    fontPairing: crawlData.font_pairings || 'Plus Jakarta Sans & Inter',
    tone: crawlData.tone || 'Modern, Professional, and Innovative',
    mission: mission,
    audience: audience,
    valueProposition: valueProposition
  };

  return BrandDnaSchema.parse(parsed);
}
