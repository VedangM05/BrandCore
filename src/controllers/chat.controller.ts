import { Request, Response } from 'express';
import { askBrandQuestion, getChatHistory, ChatMessage } from '../services/chat.service';
import { resolveBrandDna } from '../services/brandDna.service';
import { qdrantService } from '../services/qdrant.service';

const MAX_HISTORY_MESSAGES = 20;
const MAX_QUESTION_LENGTH = 2000;

export async function handleAskBrandQuestion(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { question, history } = req.body;

  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!question || typeof question !== 'string' || !question.trim()) {
    res.status(400).json({ error: 'question is required' });
    return;
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    res.status(400).json({ error: `question must be under ${MAX_QUESTION_LENGTH} characters` });
    return;
  }

  let safeHistory: ChatMessage[] = [];
  if (history !== undefined) {
    if (
      !Array.isArray(history) ||
      !history.every((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    ) {
      res.status(400).json({ error: 'history must be an array of { role: "user" | "assistant", content: string }' });
      return;
    }
    safeHistory = history.slice(-MAX_HISTORY_MESSAGES);
  }

  try {
    const result = await askBrandQuestion(id, req.user.userId, question.trim(), safeHistory);
    res.status(200).json(result);
  } catch (error: any) {
    console.error('[Chat] Failed to answer brand question:', error.message);
    res.status(500).json({ error: error.message || 'Internal server error answering question' });
  }
}

/** Loads prior conversation turns so the chat panel survives a page refresh - see chat.service.ts's getChatHistory. */
export async function handleGetChatHistory(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const rawLimit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
  const rawOffset = req.query.offset !== undefined ? Number(req.query.offset) : undefined;
  if (rawLimit !== undefined && (!Number.isFinite(rawLimit) || rawLimit < 1)) {
    res.status(400).json({ error: 'limit must be a positive number' });
    return;
  }
  if (rawOffset !== undefined && (!Number.isFinite(rawOffset) || rawOffset < 0)) {
    res.status(400).json({ error: 'offset must be a non-negative number' });
    return;
  }

  try {
    const page = await getChatHistory(id, req.user.userId, { limit: rawLimit, offset: rawOffset });
    res.status(200).json({ history: page.messages, total: page.total, limit: page.limit, offset: page.offset });
  } catch (error: any) {
    console.error('[Chat] Failed to load chat history:', error.message);
    res.status(500).json({ error: error.message || 'Internal server error loading chat history' });
  }
}

/**
 * Reports whether the Knowledge Base indexing job (enqueued right after a
 * scan - see knowledgeBase.service.ts) has produced anything queryable yet,
 * so the chat UI can show "still indexing" instead of only finding out via
 * an ungrounded answer to the user's first question.
 */
export async function handleKnowledgeStatus(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const { validDnaId } = await resolveBrandDna(id, req.user.userId);
    if (!validDnaId) {
      res.status(404).json({ error: `Brand DNA not found with ID: ${id}` });
      return;
    }
    const ready = await qdrantService.hasIndexedContent(validDnaId);
    res.status(200).json({ ready });
  } catch (error: any) {
    console.error('[Chat] Failed to check knowledge status:', error.message);
    res.status(500).json({ error: error.message || 'Internal server error checking knowledge status' });
  }
}
