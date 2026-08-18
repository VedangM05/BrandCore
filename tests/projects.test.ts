import request from 'supertest';
import app from '../src/app';
import { initializeDatabase, cleanDatabase, closeDatabase, query } from '../src/db';
import { registerUser } from '../src/services/auth.service';
import { getTestAuthSession } from './helpers/testAuth';
import { upsertProject, listProjects, deleteProject } from '../src/services/project.service';

describe('Multi-Tenant Projects API', () => {
  let authHeader: string;
  let userId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
    const session = await getTestAuthSession();
    authHeader = session.authHeader;
    userId = session.userId;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  async function insertBrandDna(ownerId: string, url: string, title: string): Promise<string> {
    const domain = new URL(url).hostname;
    const res = await query(
      `INSERT INTO crawl_results (domain, url, title, tagline, colors, font_pairings, tone, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, url) DO UPDATE SET title = EXCLUDED.title, tagline = EXCLUDED.tagline
       RETURNING id`,
      [domain, url, title, `Tagline for ${title}`, ['#111111'], 'Inter', 'confident', ownerId]
    );
    return res.rows[0].id;
  }

  describe('upsertProject / listProjects (service level)', () => {
    it('creates a project linked to the Brand DNA id, exposed as the list item id', async () => {
      const brandDnaId = await insertBrandDna(userId, 'https://acme.example.com', 'Acme Co');
      await upsertProject(userId, {
        url: 'https://acme.example.com',
        domain: 'acme.example.com',
        name: 'Acme Co',
        brandDnaId,
      });

      const projects = await listProjects(userId);
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe(brandDnaId);
      expect(projects[0].name).toBe('Acme Co');
      expect(projects[0].url).toBe('https://acme.example.com');
      expect(projects[0].colors).toEqual(['#111111']);
      expect(projects[0].font).toBe('Inter');
    });

    it('rescanning the same (user, url) updates the existing row instead of duplicating it', async () => {
      const firstDnaId = await insertBrandDna(userId, 'https://acme.example.com', 'Acme Co');
      await upsertProject(userId, {
        url: 'https://acme.example.com',
        domain: 'acme.example.com',
        name: 'Acme Co',
        brandDnaId: firstDnaId,
      });

      const secondDnaId = await insertBrandDna(userId, 'https://acme.example.com', 'Acme Co Rebrand');
      await upsertProject(userId, {
        url: 'https://acme.example.com',
        domain: 'acme.example.com',
        name: 'Acme Co Rebrand',
        brandDnaId: secondDnaId,
      });

      const projects = await listProjects(userId);
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe(secondDnaId);
      expect(projects[0].name).toBe('Acme Co Rebrand');
    });

    it("scopes projects per user - one user never sees another user's projects", async () => {
      const otherUserId = await registerUser('other-projects-owner@brandcore.com', 'password123');

      const myDnaId = await insertBrandDna(userId, 'https://mine.example.com', 'Mine Inc');
      await upsertProject(userId, { url: 'https://mine.example.com', domain: 'mine.example.com', name: 'Mine Inc', brandDnaId: myDnaId });

      const theirDnaId = await insertBrandDna(otherUserId, 'https://theirs.example.com', 'Theirs Inc');
      await upsertProject(otherUserId, { url: 'https://theirs.example.com', domain: 'theirs.example.com', name: 'Theirs Inc', brandDnaId: theirDnaId });

      const myProjects = await listProjects(userId);
      const theirProjects = await listProjects(otherUserId);

      expect(myProjects).toHaveLength(1);
      expect(myProjects[0].id).toBe(myDnaId);
      expect(theirProjects).toHaveLength(1);
      expect(theirProjects[0].id).toBe(theirDnaId);
    });
  });

  describe('GET /api/projects', () => {
    it('requires authentication', async () => {
      const res = await request(app).get('/api/projects');
      expect(res.status).toBe(401);
    });

    it("returns only the authenticated user's projects, newest first", async () => {
      const dnaId1 = await insertBrandDna(userId, 'https://first.example.com', 'First Co');
      await upsertProject(userId, { url: 'https://first.example.com', domain: 'first.example.com', name: 'First Co', brandDnaId: dnaId1 });

      const dnaId2 = await insertBrandDna(userId, 'https://second.example.com', 'Second Co');
      await upsertProject(userId, { url: 'https://second.example.com', domain: 'second.example.com', name: 'Second Co', brandDnaId: dnaId2 });

      const res = await request(app).get('/api/projects').set('Authorization', authHeader);
      expect(res.status).toBe(200);
      expect(res.body.projects).toHaveLength(2);
      expect(res.body.projects[0].id).toBe(dnaId2); // most recently upserted first
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('deletes an owned project', async () => {
      const dnaId = await insertBrandDna(userId, 'https://deleteme.example.com', 'Delete Me');
      await upsertProject(userId, { url: 'https://deleteme.example.com', domain: 'deleteme.example.com', name: 'Delete Me', brandDnaId: dnaId });

      const res = await request(app).delete(`/api/projects/${dnaId}`).set('Authorization', authHeader);
      expect(res.status).toBe(200);

      const projects = await listProjects(userId);
      expect(projects).toHaveLength(0);
    });

    it("404s (not 403) when deleting another user's project, and leaves it intact", async () => {
      const otherUserId = await registerUser('other-delete-owner@brandcore.com', 'password123');
      const theirDnaId = await insertBrandDna(otherUserId, 'https://notyours.example.com', 'Not Yours');
      await upsertProject(otherUserId, { url: 'https://notyours.example.com', domain: 'notyours.example.com', name: 'Not Yours', brandDnaId: theirDnaId });

      const res = await request(app).delete(`/api/projects/${theirDnaId}`).set('Authorization', authHeader);
      expect(res.status).toBe(404);

      const stillThere = await listProjects(otherUserId);
      expect(stillThere).toHaveLength(1);
    });

    it('404s for a nonexistent id', async () => {
      const res = await request(app)
        .delete('/api/projects/00000000-0000-0000-0000-000000000000')
        .set('Authorization', authHeader);
      expect(res.status).toBe(404);
    });
  });

  describe('deleteProject (service level)', () => {
    it('is a no-op returning false for a non-owned id', async () => {
      const otherUserId = await registerUser('other-svc-owner@brandcore.com', 'password123');
      const theirDnaId = await insertBrandDna(otherUserId, 'https://svc.example.com', 'Svc Co');
      await upsertProject(otherUserId, { url: 'https://svc.example.com', domain: 'svc.example.com', name: 'Svc Co', brandDnaId: theirDnaId });

      const deleted = await deleteProject(theirDnaId, userId);
      expect(deleted).toBe(false);
    });
  });
});
