import { apiRequestJson } from './client';

export interface ProjectRecord {
  id: string;
  name: string;
  url: string;
  description: string | null;
  colors: string[] | null;
  font: string | null;
  tone: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fetches this user's server-persisted projects (see project.service.ts).
 * `id` is the Brand DNA id, so it drops straight into `brandDnaId` on every
 * generation call - no separate mapping needed.
 */
export async function fetchProjects(): Promise<ProjectRecord[]> {
  const data = await apiRequestJson<{ projects: ProjectRecord[] }>('/api/projects');
  return data.projects;
}

// Note: DELETE /api/projects/:id exists on the backend (project.controller.ts)
// but has no frontend caller yet - no delete-project UI has been wired up
// (ProjectContext/WorkspaceHeader/Sidebar). Add a client wrapper here
// alongside whatever UI actually calls it, rather than speculatively ahead
// of one.
