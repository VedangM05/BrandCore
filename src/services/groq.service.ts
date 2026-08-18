import * as dotenv from 'dotenv';

// Self-sufficient regardless of import order (mirrors rateLimit.middleware.ts
// / embedding.service.ts / cache.service.ts - see HANDOFF.md §18/§20 for the
// exact bug class this pattern avoids). This module is imported by
// creative.service.ts, intelligence.service.ts, and chat.service.ts, any of
// which can end up early in a given import chain.
dotenv.config();

/**
 * Groq-hosted open-weight model fallback chain (HANDOFF.md §21 - replaces
 * Gemini as this app's text LLM provider; Gemini remains for embeddings
 * AND vision - see the note on vision below, and embedding.service.ts for
 * why embeddings were never on the table for Groq at all).
 *
 * Groq has no rolling "-latest" alias the way Gemini does (see this
 * project's own deleted geminiModels.ts history - pinned Gemini snapshot
 * names went dead silently mid-project, see HANDOFF.md §16), and Groq's
 * hosted lineup churns *faster* than Gemini's, not slower.
 *
 * **This list is verified against Groq's live `/v1/models` endpoint as of
 * this session** (HANDOFF.md §22) - the first version of this list,
 * written from training-data knowledge of Groq's lineup without a real API
 * key to check against, was **entirely dead on arrival**: every model in
 * it 404'd or had been decommissioned, and this file's own retry-across-
 * models design meant that failure was completely silent (fell through to
 * each caller's local heuristic fallback with no visible error) until a
 * real end-to-end test run surfaced it. If every model below starts
 * failing again, don't repeat that mistake - query
 * `GET https://api.groq.com/openai/v1/models` with a real key (or check
 * https://console.groq.com/docs/models) and verify a replacement actually
 * returns 200 before pinning it here, the same way this list's current
 * values were confirmed.
 */
export const GROQ_TEXT_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.6-27b'];

/**
 * No GROQ_VISION_MODELS export here (deliberately, see creative.service.ts's
 * runImageBrandQaNode) - Groq's live model catalog, as of this session, has
 * **no vision-capable model at all** (confirmed by querying `/v1/models`
 * and testing image input against every text model returned - all reject
 * multimodal content outright). Image Brand QA stays on Gemini vision
 * (gemini-flash-latest / gemini-flash-lite-latest, both confirmed working
 * with a real image + real key), reusing the GEMINI_API_KEY this app
 * already requires for embeddings. If Groq ever ships a vision-capable
 * model, re-verify it actually accepts image input (the same way this
 * session did) before switching runImageBrandQaNode over.
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * One chat-completion attempt against a single model, with a single
 * built-in retry on HTTP 429. Groq's free tier enforces tighter
 * requests-per-minute limits than Gemini's free tier did in practice, and
 * this app's own QA-retry loop (executeCreativePipeline) can issue up to 3
 * sequential Groq calls for one generation request before even counting
 * concurrent users - without this, a single rate-limit response would
 * immediately burn that model attempt and fall through to the next model
 * (or the local heuristic fallback) even though the very next request a
 * second later would likely have succeeded. Bounded to one retry (not an
 * open-ended backoff loop) - if it's still 429 after that, moving on to
 * try the next model (or the caller's fallback) is the right call, not
 * spinning here.
 */
async function postGroqChat(
  apiKey: string,
  model: string,
  content: any,
  temperature: number,
  jsonMode: boolean
): Promise<any | null> {
  const body = {
    model,
    messages: [{ role: 'user', content }],
    temperature,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (response.status === 429 && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      continue;
    }
    if (!response.ok) return null;
    return response.json();
  }
  return null;
}

/**
 * Groq/OpenAI-compatible JSON mode 400s on some backends if the request
 * doesn't contain the literal word "json" anywhere in the messages - every
 * prompt in this codebase already says "Respond ONLY with a valid JSON
 * object/array...", so this is normally a no-op, but it's a subtle
 * requirement that a future prompt edit could silently violate (nothing
 * about dropping the word "JSON" from a prompt looks dangerous at a
 * glance). This is a defensive backstop, not a substitute for prompts
 * saying so themselves.
 */
function ensureJsonMentioned(promptText: string): string {
  return /\bjson\b/i.test(promptText) ? promptText : `${promptText}\n\nRespond with valid JSON.`;
}

export interface GroqJsonCallOptions<T> {
  models: string[];
  temperature: number;
  /** For vision calls (runImageBrandQaNode) - appended alongside the text prompt. */
  inlineImage?: { mimeType: string; data: string };
  /** Short label for warn/log lines, e.g. "copy generation for Acme Co". */
  logLabel: string;
  /** Parses/validates the model's JSON reply; return null to try the next model. */
  validate: (parsed: any) => T | null;
}

/**
 * Shared retry-across-models JSON-response caller - replaces
 * creative.service.ts's old Gemini-specific `callGeminiJSON` (used there
 * for copy generation, campaign ideas, image QA, and text QA) and is now
 * also used by intelligence.service.ts (Brand DNA synthesis) and
 * chat.service.ts's answer generation doesn't use this (needs free-form
 * text, not JSON - see callGroqText below), consolidating what would
 * otherwise be near-identical fetch/parse/retry loops in three separate
 * files into one. Returns null (never throws) if there's no GROQ_API_KEY
 * or every model in `models` fails/rejects, so callers keep their own
 * existing local-heuristic fallback behavior for that case, unchanged from
 * the Gemini version's contract.
 */
export async function callGroqJSON<T>(promptText: string, options: GroqJsonCallOptions<T>): Promise<T | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const safePrompt = ensureJsonMentioned(promptText);
  const content: any = options.inlineImage
    ? [
        { type: 'text', text: safePrompt },
        { type: 'image_url', image_url: { url: `data:${options.inlineImage.mimeType};base64,${options.inlineImage.data}` } },
      ]
    : safePrompt;

  for (const model of options.models) {
    try {
      const data = await postGroqChat(apiKey, model, content, options.temperature, true);
      if (!data) continue;

      const rawText = data?.choices?.[0]?.message?.content;
      if (!rawText) continue;

      const cleanJsonStr = rawText.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleanJsonStr);
      const result = options.validate(parsed);
      if (result !== null) {
        console.log(`[Groq API] ${options.logLabel} succeeded using ${model}`);
        return result;
      }
    } catch (err: any) {
      console.warn(`[Groq API] ${options.logLabel} - model ${model} attempt note:`, err.message);
    }
  }
  return null;
}

/**
 * Plain-text (non-JSON-mode) variant for chat.service.ts's free-form
 * answer generation - forcing JSON mode there would make the model emit a
 * JSON object instead of a natural-language reply to the user's question.
 */
export async function callGroqText(promptText: string, models: string[], temperature: number, logLabel: string): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  for (const model of models) {
    try {
      const data = await postGroqChat(apiKey, model, promptText, temperature, false);
      if (!data) continue;
      const text = data?.choices?.[0]?.message?.content;
      if (text) {
        console.log(`[Groq API] ${logLabel} succeeded using ${model}`);
        return text.trim();
      }
    } catch (err: any) {
      console.warn(`[Groq API] ${logLabel} - model ${model} attempt note:`, err.message);
    }
  }
  return null;
}
