import { Request, Response } from 'express';
import { listProjects, deleteProject } from '../services/project.service';

export async function handleListProjects(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const projects = await listProjects(req.user.userId);
    res.status(200).json({ projects });
  } catch (error: any) {
    console.error('[Projects] List failed:', error.message);
    res.status(500).json({ error: error.message || 'Internal server error listing projects' });
  }
}

export async function handleDeleteProject(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const deleted = await deleteProject(id, req.user.userId);
    if (!deleted) {
      // Same response whether the id doesn't exist or belongs to another
      // user, consistent with the rest of the app's ownership checks.
      res.status(404).json({ error: `Project not found with ID: ${id}` });
      return;
    }
    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[Projects] Delete failed:', error.message);
    res.status(500).json({ error: error.message || 'Internal server error deleting project' });
  }
}
