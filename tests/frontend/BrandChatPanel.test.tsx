import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrandChatPanel } from '../../src/frontend/src/components/dna/BrandChatPanel';

/**
 * The panel calls three endpoints on mount/interaction: GET .../chat/history
 * (restores prior turns), GET .../knowledge-status (polled on mount - see
 * BrandChatPanel.tsx), and POST .../chat (per question). Mocks must be
 * URL-aware - and check the more specific /chat/history path before the
 * bare /chat one, since the latter is a substring of the former - so each
 * endpoint gets its own deterministic response instead of borrowing another
 * endpoint's mock shape.
 */
function mockFetchRouter(
  opts: { ready?: boolean; chatResponse?: any; chatOk?: boolean; history?: ChatHistoryMessage[]; historyTotal?: number } = {}
) {
  const { ready = true, chatResponse = { answer: 'done', grounded: true, sources: [] }, chatOk = true, history = [], historyTotal } = opts;
  return jest.fn().mockImplementation((url: string) => {
    if (url.includes('/chat/history')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ history, total: historyTotal ?? history.length, limit: 20, offset: 0 }),
      });
    }
    if (url.includes('/knowledge-status')) {
      return Promise.resolve({ ok: true, json: async () => ({ ready }) });
    }
    if (url.includes('/chat')) {
      return Promise.resolve({ ok: chatOk, json: async () => (chatOk ? chatResponse : { error: chatResponse }) });
    }
    return Promise.reject(new Error(`Unexpected fetch to ${url}`));
  });
}

interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

describe('BrandChatPanel', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('renders an empty state prompt before any question is asked', async () => {
    global.fetch = mockFetchRouter({ ready: true });
    render(<BrandChatPanel brandDnaId="dna-1" brandName="Acme Co" />);
    expect(screen.getByText(/Ask about Acme Co/i)).toBeInTheDocument();
    expect(screen.getByText(/Try:/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('chat-indexing-indicator')).not.toBeInTheDocument());
  });

  it('restores prior conversation turns from history on mount', async () => {
    global.fetch = mockFetchRouter({
      ready: true,
      history: [
        { role: 'user', content: 'Do you ship internationally?' },
        { role: 'assistant', content: 'Yes, to over 40 countries.' },
      ],
    });

    render(<BrandChatPanel brandDnaId="dna-1" brandName="Acme Co" />);

    expect(await screen.findByText('Do you ship internationally?')).toBeInTheDocument();
    expect(await screen.findByText('Yes, to over 40 countries.')).toBeInTheDocument();
    expect(screen.queryByText(/Try:/i)).not.toBeInTheDocument(); // empty-state hint shouldn't show once history exists
  });

  it('shows "Load older messages" only when more history exists beyond the loaded page, and loads it on click', async () => {
    const recentPage = [
      { role: 'user' as const, content: 'Recent question' },
      { role: 'assistant' as const, content: 'Recent answer' },
    ];
    const olderPage = [
      { role: 'user' as const, content: 'Older question' },
      { role: 'assistant' as const, content: 'Older answer' },
    ];

    let callCount = 0;
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/chat/history')) {
        callCount++;
        // First call (mount, offset absent/0) returns the recent page with
        // a total indicating more exists; the "load older" click passes
        // offset=2 (2 already-loaded messages) and gets the older page.
        const isLoadOlderCall = url.includes('offset=2');
        return Promise.resolve({
          ok: true,
          json: async () => ({
            history: isLoadOlderCall ? olderPage : recentPage,
            total: 4,
            limit: 20,
            offset: isLoadOlderCall ? 2 : 0,
          }),
        });
      }
      if (url.includes('/knowledge-status')) return Promise.resolve({ ok: true, json: async () => ({ ready: true }) });
      return Promise.reject(new Error(`Unexpected fetch to ${url}`));
    });

    render(<BrandChatPanel brandDnaId="dna-1" brandName="Acme Co" />);

    expect(await screen.findByText('Recent question')).toBeInTheDocument();
    const loadOlderButton = await screen.findByTestId('chat-load-older');

    fireEvent.click(loadOlderButton);

    expect(await screen.findByText('Older question')).toBeInTheDocument();
    // Older messages prepend above the already-loaded recent ones.
    const listText = screen.getByTestId('chat-message-list').textContent || '';
    expect(listText.indexOf('Older question')).toBeLessThan(listText.indexOf('Recent question'));
    // All 4 turns now loaded (2 + 2 = total) - button should disappear.
    await waitFor(() => expect(screen.queryByTestId('chat-load-older')).not.toBeInTheDocument());
    expect(callCount).toBe(2);
  });

  it('shows the indexing indicator until the Knowledge Base reports ready', async () => {
    global.fetch = mockFetchRouter({ ready: false });
    render(<BrandChatPanel brandDnaId="dna-1" brandName="Acme Co" />);
    expect(await screen.findByTestId('chat-indexing-indicator')).toBeInTheDocument();
  });

  it('sends a question, shows the user message immediately, then the grounded answer', async () => {
    global.fetch = mockFetchRouter({ ready: true, chatResponse: { answer: 'They sell handmade pottery.', grounded: true, sources: [{ type: 'website_page', snippet: 'pottery' }] } });

    render(<BrandChatPanel brandDnaId="dna-1" brandName="Acme Co" />);

    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'What do you sell?' } });
    fireEvent.click(screen.getByTestId('chat-send'));

    expect(await screen.findByText('What do you sell?')).toBeInTheDocument();
    expect(await screen.findByText('They sell handmade pottery.')).toBeInTheDocument();

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/dna/dna-1/chat',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ question: 'What do you sell?', history: [] }),
      })
    );
  });

  it('sends prior turns as history on the second question', async () => {
    global.fetch = mockFetchRouter({ ready: true, chatResponse: { answer: 'Yes, worldwide.', grounded: true, sources: [] } });

    render(<BrandChatPanel brandDnaId="dna-1" brandName="Acme Co" />);

    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'Do you ship?' } });
    fireEvent.click(screen.getByTestId('chat-send'));
    await screen.findByText('Yes, worldwide.');

    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'Internationally too?' } });
    fireEvent.click(screen.getByTestId('chat-send'));
    await screen.findByText('Internationally too?');

    await waitFor(() => {
      const chatCalls = (global.fetch as jest.Mock).mock.calls.filter((c) => c[0].includes('/chat'));
      const body = JSON.parse(chatCalls[chatCalls.length - 1][1].body);
      expect(body.history).toEqual([
        { role: 'user', content: 'Do you ship?' },
        { role: 'assistant', content: 'Yes, worldwide.' },
      ]);
    });
  });

  it('shows a not-grounded hint when the answer is not grounded in indexed content', async () => {
    global.fetch = mockFetchRouter({ ready: true, chatResponse: { answer: "I don't have that indexed yet.", grounded: false, sources: [] } });

    render(<BrandChatPanel brandDnaId="dna-1" brandName="Acme Co" />);
    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'Anything?' } });
    fireEvent.click(screen.getByTestId('chat-send'));

    await screen.findByText("I don't have that indexed yet.");
    expect(screen.getByText(/Not grounded in indexed content/i)).toBeInTheDocument();
  });

  it('shows an error banner when the request fails', async () => {
    global.fetch = mockFetchRouter({ ready: true, chatOk: false, chatResponse: 'Server error' });

    render(<BrandChatPanel brandDnaId="dna-1" brandName="Acme Co" />);
    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'Anything?' } });
    fireEvent.click(screen.getByTestId('chat-send'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Server error');
  });

  it('disables the send button while a question is in flight, and for empty input', async () => {
    global.fetch = mockFetchRouter({ ready: true });
    render(<BrandChatPanel brandDnaId="dna-1" brandName="Acme Co" />);
    expect(screen.getByTestId('chat-send')).toBeDisabled(); // empty input

    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'Anything?' } });
    expect(screen.getByTestId('chat-send')).not.toBeDisabled();

    let resolveChat: (v: any) => void;
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/knowledge-status')) return Promise.resolve({ ok: true, json: async () => ({ ready: true }) });
      return new Promise((resolve) => {
        resolveChat = resolve;
      });
    });

    fireEvent.click(screen.getByTestId('chat-send'));
    expect(screen.getByTestId('chat-send')).toBeDisabled(); // in flight

    resolveChat!({ ok: true, json: async () => ({ answer: 'done', grounded: true, sources: [] }) });
    await screen.findByText('done');
  });
});
