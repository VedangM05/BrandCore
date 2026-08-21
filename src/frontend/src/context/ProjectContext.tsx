import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchProjects } from '../api/projects';

export interface Project {
  id: string;
  name: string;
  url?: string;
  description: string;
  logoUrl?: string;
  colors?: string[];
  font?: string;
  tone?: string;
}

export interface ProjectContextType {
  projects: Project[];
  activeProject: Project | null;
  error: string | null;
  selectProject: (id: string) => void;
  addScannedBrand: (dna: { id?: string; url: string; title?: string; brandName?: string; colors?: string[]; font?: string; tone?: string; tagline?: string }) => Project;
  isLoading: boolean;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

function loadStoredBrands(): Project[] {
  try {
    const raw = localStorage.getItem('scanned_brands');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredBrands(brands: Project[]): void {
  try {
    localStorage.setItem('scanned_brands', JSON.stringify(brands));
  } catch {
    // Ignore storage quota errors in test/sandbox
  }
}

// Matches exactly the fallback id addScannedBrand generates below
// (`brand-${Date.now()}`) when no real server id was available yet -
// distinguishes "this was never a real synced project" from "a real
// project genuinely went missing".
const PROVISIONAL_ID_PATTERN = /^brand-\d+$/;
function isProvisionalId(id: string): boolean {
  return PROVISIONAL_ID_PATTERN.test(id);
}

export const ProjectProvider: React.FC<{
  children: React.ReactNode;
  initialProjects?: Project[];
  initialSelectedId?: string;
}> = ({ children, initialProjects, initialSelectedId }) => {
  const [projects, setProjects] = useState<Project[]>(() => {
    if (initialProjects) return initialProjects;
    return loadStoredBrands();
  });
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Hydrate from the server-persisted project list (see project.service.ts)
  // so a scanned brand survives across browsers/devices instead of living
  // only in this tab's localStorage. Skipped entirely when a test/story
  // injects `initialProjects` directly, so ProjectContext.test.tsx's
  // synchronous, network-free assertions stay unaffected. Failures (offline,
  // backend down, logged out) are swallowed - the localStorage-hydrated
  // state from useState above remains the fallback, matching this
  // component's existing "never hard-fail the workspace" behavior.
  useEffect(() => {
    if (initialProjects) return;
    let cancelled = false;
    fetchProjects()
      .then((remoteProjects) => {
        if (cancelled || remoteProjects.length === 0) return;
        const mapped: Project[] = remoteProjects.map((p) => ({
          id: p.id,
          name: p.name,
          url: p.url,
          description: p.description || `Scanned brand DNA for ${p.url}`,
          colors: p.colors || undefined,
          font: p.font || undefined,
          tone: p.tone || undefined,
        }));
        setProjects(mapped);
        saveStoredBrands(mapped);
      })
      .catch(() => {
        // Offline / not authenticated yet / backend unreachable - keep
        // whatever localStorage already had.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      setIsLoading(true);
      setError(null);

      const savedProjectId = initialSelectedId || localStorage.getItem('activeProjectId');
      if (savedProjectId) {
        const found = projects.find((p) => p.id === savedProjectId);
        if (found) {
          setActiveProject(found);
        } else if (isProvisionalId(savedProjectId)) {
          // A provisional id (ProjectContext's own client-side fallback,
          // used when a scan finished without a real server id yet - see
          // addScannedBrand below) not resolving later is expected, not a
          // real problem: it was never actually persisted server-side, so
          // there's nothing "missing or deleted" to warn about. Clean up
          // the stale reference silently instead of surfacing an error
          // banner for something the user never lost.
          try {
            localStorage.removeItem('activeProjectId');
          } catch {}
          setActiveProject(projects.length > 0 ? projects[0] : null);
        } else {
          setError(`Project profile "${savedProjectId}" is missing or deleted.`);
          if (projects.length > 0) {
            setActiveProject(projects[0]);
          } else {
            setActiveProject(null);
          }
        }
      } else {
        if (projects.length > 0) {
          setActiveProject(projects[0]);
        } else {
          setActiveProject(null);
        }
      }
    } catch (err: any) {
      setError('Failed to hydrate project workspace selection.');
    } finally {
      setIsLoading(false);
    }
  }, [projects, initialSelectedId]);

  const selectProject = React.useCallback(
    (id: string) => {
      setError(null);
      const found = projects.find((p) => p.id === id);
      if (found) {
        setActiveProject(found);
        try {
          localStorage.setItem('activeProjectId', id);
        } catch (e) {
          // Fallback for isolated test envs without localStorage
        }
      } else {
        setError(`Cannot switch workspace: project profile "${id}" does not exist.`);
      }
    },
    [projects]
  );

  const addScannedBrand = React.useCallback(
    (dna: { id?: string; url: string; title?: string; brandName?: string; colors?: string[]; font?: string; tone?: string; tagline?: string }): Project => {
      setError(null);
      const domain = dna.url ? new URL(dna.url).hostname : 'scanned-brand';
      const brandName = dna.brandName || dna.title || domain;
      // Match by the real backend id first (a rescan of an already-known
      // project), then fall back to url/name for entries created before
      // this project resolved a real id, or before the backend call
      // completed.
      const existing = projects.find((p) => (dna.id && p.id === dna.id) || p.url === dna.url || p.name === brandName);

      if (existing) {
        const updated = {
          ...existing,
          id: dna.id || existing.id,
          name: brandName,
          description: dna.tagline || `Scanned brand DNA for ${dna.url}`,
          colors: dna.colors || existing.colors,
          font: dna.font || existing.font,
          tone: dna.tone || existing.tone,
        };
        const nextProjects = projects.map((p) => (p.id === existing.id ? updated : p));
        setProjects(nextProjects);
        saveStoredBrands(nextProjects);
        setActiveProject(updated);
        try {
          localStorage.setItem('activeProjectId', updated.id);
        } catch {}
        return updated;
      }

      // `dna.id` is the real crawl_results/Brand DNA id returned by
      // /api/dna/scan whenever the caller has it (see BusinessDnaView.tsx).
      // Prefer it over a synthetic client-side id so this project resolves
      // correctly via resolveBrandDna and matches what /api/projects will
      // return once the list refetches - keeping this "provisional" only
      // in the (offline/pre-scan) case where no real id was supplied yet.
      const newBrand: Project = {
        id: dna.id || `brand-${Date.now()}`,
        name: brandName,
        url: dna.url,
        description: dna.tagline || `Scanned brand DNA for ${dna.url}`,
        colors: dna.colors,
        font: dna.font,
        tone: dna.tone,
      };

      const nextProjects = [newBrand, ...projects];
      setProjects(nextProjects);
      saveStoredBrands(nextProjects);
      setActiveProject(newBrand);
      try {
        localStorage.setItem('activeProjectId', newBrand.id);
      } catch {}
      return newBrand;
    },
    [projects]
  );

  return (
    <ProjectContext.Provider value={{ projects, activeProject, error, selectProject, addScannedBrand, isLoading }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};
