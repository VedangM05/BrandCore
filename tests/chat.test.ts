import request from 'supertest';
import app from '../src/app';
import { initializeDatabase, cleanDatabase, closeDatabase, query } from '../src/db';
import { getTestAuthSession } from './helpers/testAuth';
import { registerUser } from '../src/services/auth.service';
import { indexBrandKnowledge } from '../src/services/knowledgeBase.service';
import { askBrandQuestion } from '../src/services/chat.service';

describe('LangGraph website Q&A chatbot', () => {
  let brandDnaId: string;
  let authHeader: string;
  let testUserId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
    const session = await getTestAuthSession();
    authHeader = session.authHeader;
    testUserId = session.userId;

    const res = await query(
      `INSERT INTO crawl_results
      (domain, url, title, markdown_content, tagline, mission, audience, value_proposition, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        'chatbrand.com',
        'https://chatbrand.com',
        'Chat Brand Roasters',
        'We roast single-origin coffee beans in small batches every week.\n\nOur beans are sourced directly from farmers in Ethiopia and Colombia, with fair-trade pricing.\n\nWe ship fresh-roasted coffee within 48 hours of roasting, nationwide.',
        'Coffee, roasted with intention.',
        'To connect coffee drinkers directly with the farmers who grow their beans.',
        'Coffee enthusiasts who care about sourcing.',
        'Fresher, fairer, more traceable coffee.',
        testUserId,
      ]
    );
    brandDnaId = res.rows[0].id;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe('askBrandQuestion (service level)', () => {
    it('answers grounded in the indexed website content', async () => {
      // Retrieval (embeddings) is Gemini, answer generation is Groq (see
      // HANDOFF.md §21) - a genuinely grounded answer needs both configured.
      if (!process.env.GEMINI_API_KEY || !process.env.GROQ_API_KEY) {
        console.warn('[chat.test] Skipping - GEMINI_API_KEY and/or GROQ_API_KEY not configured');
        return;
      }

      await indexBrandKnowledge(brandDnaId);
      const result = await askBrandQuestion(brandDnaId, testUserId, 'Where do you source your coffee beans from?');

      expect(result.grounded).toBe(true);
      expect(result.answer.toLowerCase()).toMatch(/ethiopia|colombia/);
      expect(result.sources.length).toBeGreaterThan(0);
    }, 30000);

    it('degrades gracefully when nothing has been indexed yet for the brand', async () => {
      const result = await askBrandQuestion(brandDnaId, testUserId, 'What do you sell?');
      expect(result.grounded).toBe(false);
      expect(result.answer.toLowerCase()).toContain("don't have");
    }, 15000);

    it('never resolves or answers using a brand the caller does not own', async () => {
      const otherUserId = await registerUser('chat-isolation-owner@brandcore.com', 'password123');
      const result = await askBrandQuestion(brandDnaId, otherUserId, 'What do you sell?');
      // Not owned by otherUserId - resolveBrandDna treats it as unresolved,
      // same as a nonexistent brand (see brandDna.service.ts's ownership doc).
      expect(result.grounded).toBe(false);
      expect(result.sources).toHaveLength(0);
    });
  });

  describe('POST /api/dna/:id/chat', () => {
    it('returns a grounded answer with sources', async () => {
      // Retrieval (embeddings) is Gemini, answer generation is Groq (see
      // HANDOFF.md §21) - a genuinely grounded answer needs both configured.
      if (!process.env.GEMINI_API_KEY || !process.env.GROQ_API_KEY) {
        console.warn('[chat.test] Skipping - GEMINI_API_KEY and/or GROQ_API_KEY not configured');
        return;
      }

      await indexBrandKnowledge(brandDnaId);

      const res = await request(app)
        .post(`/api/dna/${brandDnaId}/chat`)
        .set('Authorization', authHeader)
        .send({ question: 'How fast do you ship after roasting?' });

      expect(res.status).toBe(200);
      expect(res.body.answer).toBeTruthy();
      expect(res.body.grounded).toBe(true);
      expect(Array.isArray(res.body.sources)).toBe(true);
    }, 30000);

    it('rejects a missing question with 400', async () => {
      const res = await request(app).post(`/api/dna/${brandDnaId}/chat`).set('Authorization', authHeader).send({});
      expect(res.status).toBe(400);
    });

    it('rejects an overly long question with 400', async () => {
      const res = await request(app)
        .post(`/api/dna/${brandDnaId}/chat`)
        .set('Authorization', authHeader)
        .send({ question: 'a'.repeat(2001) });
      expect(res.status).toBe(400);
    });

    it('rejects a malformed history array with 400', async () => {
      const res = await request(app)
        .post(`/api/dna/${brandDnaId}/chat`)
        .set('Authorization', authHeader)
        .send({ question: 'hello', history: [{ role: 'not-a-role', content: 'x' }] });
      expect(res.status).toBe(400);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).post(`/api/dna/${brandDnaId}/chat`).send({ question: 'hello' });
      expect(res.status).toBe(401);
    });

    it('accepts and uses a valid history array', async () => {
      if (!process.env.GEMINI_API_KEY) {
        console.warn('[chat.test] Skipping - no GEMINI_API_KEY configured');
        return;
      }

      await indexBrandKnowledge(brandDnaId);

      const res = await request(app)
        .post(`/api/dna/${brandDnaId}/chat`)
        .set('Authorization', authHeader)
        .send({
          question: 'And where are they from?',
          history: [
            { role: 'user', content: 'Do you roast your own coffee?' },
            { role: 'assistant', content: 'Yes, in small weekly batches.' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.answer).toBeTruthy();
    }, 30000);
  });

  describe('Chat history persistence', () => {
    it('persists both turns of a real exchange and returns them oldest-first', async () => {
      if (!process.env.GEMINI_API_KEY) {
        console.warn('[chat.test] Skipping - no GEMINI_API_KEY configured');
        return;
      }
      await indexBrandKnowledge(brandDnaId);

      await request(app)
        .post(`/api/dna/${brandDnaId}/chat`)
        .set('Authorization', authHeader)
        .send({ question: 'Where do you source your coffee?' });

      const historyRes = await request(app).get(`/api/dna/${brandDnaId}/chat/history`).set('Authorization', authHeader);
      expect(historyRes.status).toBe(200);
      expect(historyRes.body.history).toHaveLength(2);
      expect(historyRes.body.history[0]).toEqual({ role: 'user', content: 'Where do you source your coffee?' });
      expect(historyRes.body.history[1].role).toBe('assistant');
      expect(historyRes.body.history[1].content).toBeTruthy();
    }, 30000);

    it('returns an empty history before any question has been asked', async () => {
      const res = await request(app).get(`/api/dna/${brandDnaId}/chat/history`).set('Authorization', authHeader);
      expect(res.status).toBe(200);
      expect(res.body.history).toEqual([]);
    });

    it('never returns another user\'s chat history for the same-looking request', async () => {
      const otherUserId = await registerUser('chat-history-isolation@brandcore.com', 'password123');
      const otherSession = await getTestAuthSession('chat-history-isolation@brandcore.com', 'password123');

      // Give the other user their own scanned brand at the same domain/url
      // pattern isn't possible (unique per user,url) - use a distinct url,
      // the point is that querying brandDnaId (owned by testUserId) as
      // otherUserId must not leak testUserId's history.
      const res = await request(app).get(`/api/dna/${brandDnaId}/chat/history`).set('Authorization', otherSession.authHeader);
      expect(res.status).toBe(200);
      expect(res.body.history).toEqual([]);
      void otherUserId;
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get(`/api/dna/${brandDnaId}/chat/history`);
      expect(res.status).toBe(401);
    });
  });

  describe('Chat history pagination', () => {
    async function seedTurns(count: number) {
      for (let i = 0; i < count; i++) {
        await query(
          `INSERT INTO chat_messages (user_id, brand_dna_id, role, content, grounded) VALUES
           ($1, $2, 'user', $3, NULL), ($1, $2, 'assistant', $4, true)`,
          [testUserId, brandDnaId, `question ${i}`, `answer ${i}`]
        );
      }
    }

    it('returns the most recent `limit` turns oldest-first, plus total/limit/offset', async () => {
      await seedTurns(5); // 10 rows (5 turns)

      const res = await request(app)
        .get(`/api/dna/${brandDnaId}/chat/history?limit=4`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(10);
      expect(res.body.limit).toBe(4);
      expect(res.body.offset).toBe(0);
      expect(res.body.history).toHaveLength(4);
      // Most recent 4 rows, oldest-first within the page: turn 3's answer, turn 4's question+answer... i.e. the tail end.
      expect(res.body.history[3]).toEqual({ role: 'assistant', content: 'answer 4' });
    });

    it('walks further back in time as offset increases', async () => {
      await seedTurns(5); // 10 rows

      const firstPage = await request(app)
        .get(`/api/dna/${brandDnaId}/chat/history?limit=4&offset=0`)
        .set('Authorization', authHeader);
      const secondPage = await request(app)
        .get(`/api/dna/${brandDnaId}/chat/history?limit=4&offset=4`)
        .set('Authorization', authHeader);

      const firstContents = firstPage.body.history.map((m: any) => m.content);
      const secondContents = secondPage.body.history.map((m: any) => m.content);
      // No overlap between consecutive pages.
      expect(firstContents.some((c: string) => secondContents.includes(c))).toBe(false);
    });

    it('caps limit at 100 and rejects invalid values with 400', async () => {
      const tooHigh = await request(app)
        .get(`/api/dna/${brandDnaId}/chat/history?limit=500`)
        .set('Authorization', authHeader);
      expect(tooHigh.status).toBe(200);
      expect(tooHigh.body.limit).toBe(100);

      const negative = await request(app)
        .get(`/api/dna/${brandDnaId}/chat/history?limit=-1`)
        .set('Authorization', authHeader);
      expect(negative.status).toBe(400);

      const negativeOffset = await request(app)
        .get(`/api/dna/${brandDnaId}/chat/history?offset=-1`)
        .set('Authorization', authHeader);
      expect(negativeOffset.status).toBe(400);
    });
  });

  describe('Chat history retention', () => {
    it('caps stored history at 200 rows per (user, brand), dropping the oldest first', async () => {
      // 110 turns = 220 rows, over the 200-row cap - insert via the same
      // path askBrandQuestion uses (two rows per turn) so retention (which
      // runs after every real insert) actually gets exercised.
      for (let i = 0; i < 110; i++) {
        await query(
          `INSERT INTO chat_messages (user_id, brand_dna_id, role, content, grounded) VALUES
           ($1, $2, 'user', $3, NULL), ($1, $2, 'assistant', $4, true)`,
          [testUserId, brandDnaId, `q${i}`, `a${i}`]
        );
      }
      // Retention only runs from within askBrandQuestion after a real
      // insert+cleanup call - directly invoke the same cleanup query this
      // test needs to verify against by triggering one more real turn.
      if (process.env.GEMINI_API_KEY) {
        await indexBrandKnowledge(brandDnaId);
        await askBrandQuestion(brandDnaId, testUserId, 'One more question to trigger retention cleanup');
      } else {
        console.warn('[chat.test] Skipping retention cleanup trigger - no GEMINI_API_KEY configured');
        return;
      }

      const countRes = await query('SELECT COUNT(*)::int AS count FROM chat_messages WHERE user_id = $1 AND brand_dna_id = $2', [
        testUserId,
        brandDnaId,
      ]);
      expect(countRes.rows[0].count).toBeLessThanOrEqual(200);

      // The oldest turns (q0/a0) should be gone; the newest should remain.
      const oldest = await query(`SELECT id FROM chat_messages WHERE user_id = $1 AND brand_dna_id = $2 AND content = 'q0'`, [
        testUserId,
        brandDnaId,
      ]);
      expect(oldest.rows).toHaveLength(0);
    }, 30000);
  });

  describe('GET /api/dna/:id/knowledge-status', () => {
    it('reports not ready before indexing has run', async () => {
      const res = await request(app).get(`/api/dna/${brandDnaId}/knowledge-status`).set('Authorization', authHeader);
      expect(res.status).toBe(200);
      expect(res.body.ready).toBe(false);
    });

    it('reports ready once indexing has completed', async () => {
      if (!process.env.GEMINI_API_KEY) {
        console.warn('[chat.test] Skipping - no GEMINI_API_KEY configured');
        return;
      }
      await indexBrandKnowledge(brandDnaId);
      const res = await request(app).get(`/api/dna/${brandDnaId}/knowledge-status`).set('Authorization', authHeader);
      expect(res.status).toBe(200);
      expect(res.body.ready).toBe(true);
    }, 20000);

    it('404s for a brand the caller does not own', async () => {
      const otherUserId = await registerUser('knowledge-status-isolation@brandcore.com', 'password123');
      const otherSession = await getTestAuthSession('knowledge-status-isolation@brandcore.com', 'password123');
      const res = await request(app).get(`/api/dna/${brandDnaId}/knowledge-status`).set('Authorization', otherSession.authHeader);
      expect(res.status).toBe(404);
      void otherUserId;
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get(`/api/dna/${brandDnaId}/knowledge-status`);
      expect(res.status).toBe(401);
    });
  });
});
