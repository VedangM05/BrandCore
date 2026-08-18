import { chunkText, embedText, EMBEDDING_DIMENSIONS } from '../src/services/embedding.service';

describe('embedding.service', () => {
  describe('chunkText', () => {
    it('returns an empty array for empty/whitespace-only input', () => {
      expect(chunkText('')).toEqual([]);
      expect(chunkText('   \n\n  ')).toEqual([]);
    });

    it('keeps a short single paragraph as one chunk', () => {
      const chunks = chunkText('This is a short paragraph about a brand.');
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe('This is a short paragraph about a brand.');
    });

    it('groups multiple short paragraphs into one chunk under the size limit', () => {
      const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
      const chunks = chunkText(text, 1000);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toContain('Paragraph one.');
      expect(chunks[0]).toContain('Paragraph three.');
    });

    it('splits once the accumulated size would exceed maxChars', () => {
      const para = 'x'.repeat(500);
      const text = [para, para, para].join('\n\n'); // 1500 chars of content across 3 paragraphs
      const chunks = chunkText(text, 900);
      expect(chunks.length).toBeGreaterThan(1);
      for (const c of chunks) {
        expect(c.length).toBeLessThanOrEqual(900 + 1); // allow the joining newline
      }
    });

    it('hard-splits a single paragraph that alone exceeds maxChars, with overlap', () => {
      const para = 'y'.repeat(2500);
      const chunks = chunkText(para, 1000, 100);
      expect(chunks.length).toBeGreaterThan(1);
      // Consecutive chunks overlap by roughly `overlapChars`.
      const firstTail = chunks[0].slice(-100);
      const secondHead = chunks[1].slice(0, 100);
      expect(firstTail).toBe(secondHead);
    });
  });

  describe('embedText', () => {
    it('returns a 768-dimension vector for real text (requires GEMINI_API_KEY)', async () => {
      if (!process.env.GEMINI_API_KEY) {
        console.warn('[embedding.test] Skipping - no GEMINI_API_KEY configured');
        return;
      }
      const vector = await embedText('BrandCore is an AI brand intelligence and creative generation platform.');
      expect(vector).not.toBeNull();
      expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
      expect(vector!.every((n) => typeof n === 'number')).toBe(true);
    }, 20000);

    it('returns null for empty text without calling the API', async () => {
      const vector = await embedText('   ');
      expect(vector).toBeNull();
    });

    it('returns null (not throw) when GEMINI_API_KEY is unset', async () => {
      const original = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      try {
        const vector = await embedText('some text');
        expect(vector).toBeNull();
      } finally {
        if (original) process.env.GEMINI_API_KEY = original;
      }
    });
  });
});
