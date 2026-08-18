import React, { useEffect, useRef, useState } from 'react';
import { askBrandQuestion, fetchKnowledgeStatus, fetchChatHistory, ChatMessage } from '../../api/client';

export interface BrandChatPanelProps {
  brandDnaId: string;
  brandName: string;
}

interface DisplayMessage extends ChatMessage {
  id: string;
  grounded?: boolean;
}

/**
 * "Ask questions about this website" chatbot, grounded in the brand's
 * indexed Knowledge Base (see chat.service.ts's LangGraph retrieve-then-
 * generate agent). Lives in the Business DNA section, right after a scan's
 * results - the natural place to ask "so what does this business actually
 * say about X" once you've already seen its extracted DNA.
 *
 * Keeps conversation history client-side only (sent back with each request,
 * see chat.controller.ts) - no server-side chat session/persistence exists
 * yet, so a page refresh starts a fresh conversation. Good enough for a v1;
 * a `chat_messages` table is a natural follow-up if history needs to
 * survive a refresh.
 */
const HISTORY_PAGE_SIZE = 20;

export const BrandChatPanel: React.FC<BrandChatPanelProps> = ({ brandDnaId, brandName }) => {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isIndexing, setIsIndexing] = useState(true);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Restores the most recent page of prior turns (see chat.service.ts's
  // getChatHistory) so reopening this brand's DNA view - or refreshing the
  // page - doesn't silently lose the conversation. Older turns beyond this
  // first page are fetched on demand via "Load older messages" below,
  // rather than loading a brand's entire (up to 200-turn) history upfront.
  useEffect(() => {
    let cancelled = false;
    fetchChatHistory(brandDnaId, { limit: HISTORY_PAGE_SIZE })
      .then((page) => {
        if (cancelled || page.messages.length === 0) return;
        setMessages(page.messages.map((m, i) => ({ ...m, id: `history-${i}` })));
        setHistoryTotal(page.total);
      })
      .catch(() => {
        // No history yet, or the load failed - start with an empty conversation either way.
      });
    return () => {
      cancelled = true;
    };
  }, [brandDnaId]);

  const handleLoadOlder = async () => {
    if (isLoadingOlder) return;
    setIsLoadingOlder(true);
    try {
      // The already-loaded messages are the most recent `offset` turns
      // (history load + any asked since) - the next page starts right
      // before those.
      const alreadyLoaded = messages.filter((m) => m.id.startsWith('history-')).length;
      const page = await fetchChatHistory(brandDnaId, { limit: HISTORY_PAGE_SIZE, offset: alreadyLoaded });
      if (page.messages.length > 0) {
        setMessages((prev) => [...page.messages.map((m, i) => ({ ...m, id: `history-older-${alreadyLoaded}-${i}` })), ...prev]);
      }
      setHistoryTotal(page.total);
    } catch {
      // Leave the already-loaded messages in place - a failed "load more" isn't worth an error banner.
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const loadedHistoryCount = messages.filter((m) => m.id.startsWith('history')).length;
  const hasMoreHistory = loadedHistoryCount < historyTotal;

  // Knowledge Base indexing runs as a background job right after a scan
  // (see knowledgeBase.service.ts) - poll briefly so the panel can show
  // "still indexing" instead of the user's first question silently coming
  // back ungrounded because indexing simply hadn't finished yet. Never
  // blocks asking - just an informational hint - and gives up quietly
  // after a few tries rather than polling forever.
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      if (cancelled) return;
      try {
        const status = await fetchKnowledgeStatus(brandDnaId);
        if (cancelled) return;
        if (status.ready) {
          setIsIndexing(false);
          return;
        }
      } catch {
        // Treat a failed status check as "stop polling, just let the user ask" rather than a hard error.
      }
      attempts += 1;
      if (attempts >= 8 || cancelled) {
        setIsIndexing(false);
        return;
      }
      setTimeout(poll, 3000);
    };

    setIsIndexing(true);
    poll();
    return () => {
      cancelled = true;
    };
  }, [brandDnaId]);

  useEffect(() => {
    // jsdom (tests) doesn't implement scrollTo at all - guard rather than
    // assume every environment has it.
    if (typeof scrollRef.current?.scrollTo === 'function') {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isAsking]);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || isAsking) return;

    setError(null);
    setInput('');
    const userMessage: DisplayMessage = { id: `u-${Date.now()}`, role: 'user', content: question };
    const historyForRequest = messages.map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, userMessage]);
    setIsAsking(true);

    try {
      const result = await askBrandQuestion(brandDnaId, question, historyForRequest);
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', content: result.answer, grounded: result.grounded },
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to get an answer';
      setError(message);
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <div className="rounded-xl border border-brand-border bg-brand-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-brand-border">
        <h4 className="text-sm font-semibold text-brand-text">Ask about {brandName}</h4>
        <p className="text-xs text-brand-muted mt-0.5">
          Answers are grounded in the content scanned from this website - not general knowledge.
        </p>
        {isIndexing && (
          <p className="text-xs text-state-warning-text mt-1.5 inline-flex items-center gap-1.5" data-testid="chat-indexing-indicator">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
            Indexing this website&rsquo;s content - answers may be limited for a few seconds.
          </p>
        )}
      </div>

      <div ref={scrollRef} className="max-h-72 overflow-y-auto px-4 py-3 space-y-3" data-testid="chat-message-list">
        {messages.length === 0 && (
          <p className="text-xs text-brand-muted italic">
            Try: &ldquo;What does this business do?&rdquo; or &ldquo;Who is this for?&rdquo;
          </p>
        )}
        {hasMoreHistory && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleLoadOlder}
              disabled={isLoadingOlder}
              className="text-xs text-brand-muted hover:text-brand-text underline underline-offset-2 disabled:opacity-50"
              data-testid="chat-load-older"
            >
              {isLoadingOlder ? 'Loading…' : 'Load older messages'}
            </button>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                m.role === 'user' ? 'bg-brand-text text-brand-bg' : 'bg-brand-sunken text-brand-text border border-brand-border'
              }`}
            >
              {m.content}
              {m.role === 'assistant' && m.grounded === false && (
                <p className="text-[10px] mt-1 opacity-70">Not grounded in indexed content.</p>
              )}
            </div>
          </div>
        ))}
        {isAsking && (
          <div className="flex justify-start">
            <div className="rounded-lg px-3 py-2 text-sm bg-brand-sunken text-brand-muted border border-brand-border">Thinking…</div>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="mx-4 mb-2 rounded-md bg-state-danger border border-[#F3C6C6] text-state-danger-text text-xs px-3 py-2">
          {error}
        </div>
      )}

      <form onSubmit={handleAsk} className="flex items-center gap-2 border-t border-brand-border p-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about this website…"
          className="input-field flex-1 text-sm"
          data-testid="chat-input"
          disabled={isAsking}
        />
        <button type="submit" className="btn-primary text-xs py-2.5 px-4" disabled={isAsking || !input.trim()} data-testid="chat-send">
          Ask
        </button>
      </form>
    </div>
  );
};
