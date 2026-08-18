import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { resolveBrandDna } from './brandDna.service';
import { qdrantService, QdrantSearchResult } from './qdrant.service';
import { recordNodeSpan } from './metrics.service';
import { recordUsage } from './quota.service';
import { callGroqText, GROQ_TEXT_MODELS } from './groq.service';
import { query } from '../db';

const tracer = trace.getTracer('brandcore-chat-agent');

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatSource {
  type: string;
  snippet: string;
}

export interface ChatAnswer {
  answer: string;
  grounded: boolean;
  sources: ChatSource[];
}

/**
 * LangGraph agent (spec: "LangGraph - parallel branches") powering the
 * "ask questions about this website" chatbot in the Business DNA section.
 * Two-node retrieve-then-generate graph - a real `StateGraph`/`Annotation`
 * state machine, not another hand-rolled `Promise.all` like the rest of
 * this codebase's "agent" pipeline (see creative.service.ts's docstrings on
 * why that one stayed plain async/await). This is the one place LangGraph
 * actually earns its place: a genuinely branching, stateful flow (retrieve
 * -> decide there's nothing to answer from -> generate, vs. retrieve ->
 * generate normally) rather than two independent calls that happen to run
 * in parallel.
 */
const ChatState = Annotation.Root({
  brandDnaId: Annotation<string>,
  userId: Annotation<string>,
  question: Annotation<string>,
  history: Annotation<ChatMessage[]>,
  retrievedChunks: Annotation<QdrantSearchResult[]>,
  resolvedBrandName: Annotation<string>,
  validDnaId: Annotation<string | null>,
  answer: Annotation<string>,
  grounded: Annotation<boolean>,
});

type ChatStateType = typeof ChatState.State;

async function retrieveNode(state: ChatStateType): Promise<Partial<ChatStateType>> {
  return tracer.startActiveSpan('chat_retrieve_node', async (span) => {
    const { brandDna, validDnaId } = await resolveBrandDna(state.brandDnaId, state.userId);
    if (!validDnaId) {
      span.setAttribute('chat.resolved', false);
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      recordNodeSpan('chat_retrieve_node');
      return { retrievedChunks: [], resolvedBrandName: '', validDnaId: null };
    }

    const results = await qdrantService.searchKnowledge(validDnaId, state.question, undefined, 6);
    span.setAttribute('chat.chunks_retrieved', results.length);
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    recordNodeSpan('chat_retrieve_node');
    return { retrievedChunks: results, resolvedBrandName: brandDna.title || brandDna.domain || '', validDnaId };
  });
}

async function generateNode(state: ChatStateType): Promise<Partial<ChatStateType>> {
  return tracer.startActiveSpan('chat_generate_node', async (span) => {
    if (!state.resolvedBrandName && state.retrievedChunks.length === 0) {
      span.setAttribute('chat.branch', 'no_such_brand');
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      recordNodeSpan('chat_generate_node');
      return {
        answer: "I couldn't find a scanned brand to answer from. Scan a website first, then ask again.",
        grounded: false,
      };
    }

    if (state.retrievedChunks.length === 0) {
      span.setAttribute('chat.branch', 'no_knowledge_yet');
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      recordNodeSpan('chat_generate_node');
      return {
        answer: `I don't have any indexed content for ${state.resolvedBrandName || 'this brand'} yet to answer that from. Indexing runs in the background right after a scan - try again in a moment, or rescan the site if it's been a while.`,
        grounded: false,
      };
    }

    const context = state.retrievedChunks.map((c, i) => `[${i + 1}] ${c.text}`).join('\n\n');
    const historyText = (state.history || [])
      .slice(-6)
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const prompt = `You are a helpful assistant answering questions about "${state.resolvedBrandName}" using ONLY the excerpts below, taken from that business's own website. Do not use outside knowledge and do not invent facts not present in the excerpts.

If the excerpts don't contain enough information to answer, say so plainly instead of guessing.

Website excerpts:
${context}
${historyText ? `\nConversation so far:\n${historyText}\n` : ''}
User question: "${state.question}"

Respond with a concise, direct answer (2-4 sentences unless the question needs more detail). Do not mention "excerpts" or "context" explicitly - answer naturally, as if you simply know about the business.`;

    const answer = await callGroqText(prompt, GROQ_TEXT_MODELS, 0.3, `chat answer for ${state.resolvedBrandName}`);
    span.setAttribute('chat.branch', answer ? 'answered' : 'groq_unavailable');
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    recordNodeSpan('chat_generate_node');

    if (!answer) {
      return {
        answer: 'The AI answering service is temporarily unavailable (no GROQ_API_KEY configured, or the call failed). Try again shortly.',
        grounded: false,
      };
    }
    return { answer, grounded: true };
  });
}

const chatGraph = new StateGraph(ChatState)
  .addNode('retrieve', retrieveNode)
  .addNode('generate', generateNode)
  .addEdge(START, 'retrieve')
  .addEdge('retrieve', 'generate')
  .addEdge('generate', END)
  .compile();

/**
 * Answers a question about a scanned brand's website, grounded in its
 * indexed Knowledge Base (see knowledgeBase.service.ts). `userId` scopes
 * brand resolution the same way every other brand-scoped call does (see
 * brandDna.service.ts) - a user can only chat against their own scanned
 * brands.
 */
export async function askBrandQuestion(
  brandDnaId: string,
  userId: string,
  question: string,
  history: ChatMessage[] = []
): Promise<ChatAnswer> {
  const result = await chatGraph.invoke({
    brandDnaId,
    userId,
    question,
    history,
    retrievedChunks: [],
    resolvedBrandName: '',
    validDnaId: null,
    answer: '',
    grounded: false,
  });

  // Rough token/usage estimate, consistent with the other generation
  // endpoints (see creative.service.ts's note on why this is a usage proxy,
  // not a real dollar cost, now that generation runs on Groq's free tier) -
  // a real answer involves one Gemini embedding call (the question, still
  // Gemini - see embedding.service.ts) plus one Groq chat-completion call
  // (the answer), so this is charged even when the answer degrades to a
  // "not enough indexed knowledge" message, but not when there's no brand
  // to resolve at all (retrieve short-circuited before any API call).
  if (result.resolvedBrandName || result.retrievedChunks.length > 0) {
    await recordUsage(userId, '/api/dna/chat', 300, 0.00015, false, null);
  }

  // Persist both turns so the conversation survives a page refresh (see
  // getChatHistory below) - only when the brand actually resolved to a real
  // row (chat_messages.brand_dna_id has a FK to crawl_results), i.e. never
  // for the "couldn't find a scanned brand" branch.
  if (result.validDnaId) {
    try {
      await query(
        `INSERT INTO chat_messages (user_id, brand_dna_id, role, content, grounded) VALUES
         ($1, $2, 'user', $3, NULL), ($1, $2, 'assistant', $4, $5)`,
        [userId, result.validDnaId, question, result.answer, result.grounded]
      );
      await enforceChatHistoryRetention(userId, result.validDnaId);
    } catch (err: any) {
      // Non-fatal - the answer was already produced and should still reach
      // the caller even if history persistence fails.
      console.error('[Chat] Failed to persist chat history (non-fatal):', err.message);
    }
  }

  return {
    answer: result.answer,
    grounded: result.grounded,
    sources: result.retrievedChunks.map((c) => ({ type: c.type, snippet: c.text.slice(0, 220) })),
  };
}

// Caps how much history accumulates per (user, brand) - without this,
// chat_messages grows completely unbounded for an active user/brand
// forever. 200 rows = 100 turns; generous for a real conversation while
// keeping storage/query cost bounded. Runs after every insert rather than
// as a separate scheduled job - simplest correct place given how small this
// table's per-write cost already is.
const CHAT_HISTORY_RETENTION_LIMIT = 200;

async function enforceChatHistoryRetention(userId: string, brandDnaId: string): Promise<void> {
  await query(
    `DELETE FROM chat_messages
     WHERE user_id = $1 AND brand_dna_id = $2
     AND id NOT IN (
       SELECT id FROM chat_messages WHERE user_id = $1 AND brand_dna_id = $2
       ORDER BY created_at DESC LIMIT $3
     )`,
    [userId, brandDnaId, CHAT_HISTORY_RETENTION_LIMIT]
  );
}

export interface ChatHistoryOptions {
  limit?: number;
  offset?: number;
}

export interface ChatHistoryPage {
  messages: ChatMessage[];
  total: number;
  limit: number;
  offset: number;
}

const MAX_CHAT_HISTORY_PAGE_SIZE = 100;

/**
 * Loads a page of prior conversation turns for a brand, oldest-first within
 * the page, so the frontend can restore the chat panel's history after a
 * refresh and load older turns on demand instead of fetching the entire
 * (unbounded, before retention) history in one call. `offset=0` returns the
 * most recent `limit` turns; increasing `offset` walks further back -
 * matching the same limit/offset convention `listAssets` already uses
 * (`asset.service.ts`), rather than inventing a different pagination style
 * just for this endpoint.
 *
 * Resolves brand ownership the same way askBrandQuestion does - a
 * non-owner (or a bad id) gets an empty page rather than an error, matching
 * the rest of this app's "unowned = treated as not found" pattern.
 */
export async function getChatHistory(brandDnaId: string, userId: string, options: ChatHistoryOptions = {}): Promise<ChatHistoryPage> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), MAX_CHAT_HISTORY_PAGE_SIZE);
  const offset = Math.max(options.offset ?? 0, 0);

  const { validDnaId } = await resolveBrandDna(brandDnaId, userId);
  if (!validDnaId) return { messages: [], total: 0, limit, offset };

  const countRes = await query('SELECT COUNT(*)::int AS count FROM chat_messages WHERE user_id = $1 AND brand_dna_id = $2', [
    userId,
    validDnaId,
  ]);
  const total = countRes.rows[0]?.count ?? 0;

  // Fetch newest-first (so OFFSET walks backward in time as intended for
  // "load older"), then reverse to oldest-first for display order within
  // the page.
  const res = await query(
    `SELECT role, content FROM chat_messages WHERE user_id = $1 AND brand_dna_id = $2
     ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
    [userId, validDnaId, limit, offset]
  );
  const messages = res.rows.reverse().map((r) => ({ role: r.role, content: r.content }));

  return { messages, total, limit, offset };
}
