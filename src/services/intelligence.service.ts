import { z } from 'zod';
import { trace, SpanStatusCode } from '@opentelemetry/api';

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
 * Synthesizes crawled text, headings, and visual attributes into a Zod-validated Brand DNA model.
 * Performs a single optimized LLM call chain if GEMINI_API_KEY is configured,
 * otherwise falls back to a deterministic, local heuristic compiler.
 */
export async function synthesizeBrandDna(crawlData: CrawlData): Promise<BrandDna> {
  return tracer.startActiveSpan('brand_intelligence_synthesis', async (span) => {
    span.setAttribute('dna.url', crawlData.url);
    span.setAttribute('dna.title', crawlData.title);

    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      span.setAttribute('intelligence.execution_mode', 'llm');
      
      // Execute structured single-call Gemini LLM request
      return tracer.startActiveSpan('gemini_api_request', async (llmSpan) => {
        llmSpan.setAttribute('llm.provider', 'google');
        llmSpan.setAttribute('llm.model', 'gemini-2.5-flash');

        try {
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

Please output a strictly-validated brand DNA JSON matching this structure:
{
  "brandName": "Short brand name",
  "tagline": "A compelling, catchy brand tagline",
  "colors": ["Hex code #1", "Hex code #2", "etc."], // must be valid hex, min 2 colors
  "fontPairing": "Header Font & Body Font pairings",
  "tone": "Brief description of brand voice and tone",
  "mission": "Unified core mission statement of the brand",
  "audience": "Primary target audience description",
  "valueProposition": "A concise value proposition outlining core benefit"
}
`;

          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                  responseMimeType: 'application/json',
                  responseSchema: {
                    type: 'OBJECT',
                    properties: {
                      brandName: { type: 'STRING' },
                      tagline: { type: 'STRING' },
                      colors: {
                        type: 'ARRAY',
                        items: { type: 'STRING' }
                      },
                      fontPairing: { type: 'STRING' },
                      tone: { type: 'STRING' },
                      mission: { type: 'STRING' },
                      audience: { type: 'STRING' },
                      valueProposition: { type: 'STRING' }
                    },
                    required: ['brandName', 'tagline', 'colors', 'fontPairing', 'tone', 'mission', 'audience', 'valueProposition']
                  }
                }
              })
            }
          );

          if (!response.ok) {
            throw new Error(`Gemini API call failed with status: ${response.status}`);
          }

          const responseData = await response.json();
          const jsonText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
          
          if (!jsonText) {
            throw new Error('Empty or invalid output received from Gemini API');
          }

          const parsed = JSON.parse(jsonText);
          
          // Validate structure strictly against Zod
          const validated = BrandDnaSchema.parse(parsed);

          // Estimate API tokens (crude characters-to-tokens count for logging / cost reduction check)
          const inputTokens = Math.ceil(prompt.length / 4);
          const outputTokens = Math.ceil(jsonText.length / 4);
          const cost = (inputTokens * 0.075 / 1000000) + (outputTokens * 0.30 / 1000000);
          
          console.log(`[LLM COST] Input Tokens: ${inputTokens}, Output Tokens: ${outputTokens}, Est. Cost: $${cost.toFixed(6)}`);
          
          llmSpan.setAttribute('llm.input_tokens', inputTokens);
          llmSpan.setAttribute('llm.output_tokens', outputTokens);
          llmSpan.setAttribute('llm.cost_usd', cost);
          llmSpan.setStatus({ code: SpanStatusCode.OK });

          span.setStatus({ code: SpanStatusCode.OK });
          return validated;

        } catch (error: any) {
          llmSpan.recordException(error);
          llmSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message || 'LLM Synthesis failed'
          });
          // Fall back to local compiler if LLM request fails to ensure no pipeline crash
          console.warn('[Intelligence] LLM Synthesis failed. Falling back to local heuristic compiler.', error.message);
          const fallbackVal = executeLocalFallback(crawlData);
          span.setStatus({ code: SpanStatusCode.OK });
          return fallbackVal;
        } finally {
          llmSpan.end();
        }
      });
    } else {
      // Execution mode is fallback
      span.setAttribute('intelligence.execution_mode', 'local_fallback');
      console.log('[Intelligence] GEMINI_API_KEY not configured. Executing local heuristic synthesis compiler.');
      
      const validated = executeLocalFallback(crawlData);
      
      console.log(`[LLM COST] Input Tokens: 0, Output Tokens: 0, Est. Cost: $0.000000 (Local Heuristics Fallback - 100% savings)`);
      span.setAttribute('llm.cost_usd', 0);
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
