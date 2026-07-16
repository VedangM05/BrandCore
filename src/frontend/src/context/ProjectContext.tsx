import React, { createContext, useContext, useState, useEffect } from 'react';

export interface Project {
  id: string;
  name: string;
  description: string;
}

export interface ProjectContextType {
  projects: Project[];
  activeProject: Project | null;
  error: string | null;
  selectProject: (id: string) => void;
  isLoading: boolean;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

const DUMMY_PROJECTS: Project[] = [
  { id: 'proj-1', name: 'BrandCore Marketing UI', description: 'Design system and marketing campaign assets' },
  { id: 'proj-2', name: 'Acme SaaS Client Portal', description: 'Client onboarding portal and administrative dashboard' },
  { id: 'proj-3', name: 'Nike Retail Experience', description: 'Interactive product discovery widgets for store kiosks' }
];

export const ProjectProvider: React.FC<{
  children: React.ReactNode;
  initialProjects?: Project[];
  initialSelectedId?: string;
}> = ({ children, initialProjects = DUMMY_PROJECTS, initialSelectedId }) => {
  const [projects] = useState<Project[]>(initialProjects);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    try {
      setIsLoading(true);
      setError(null);

      const savedProjectId = initialSelectedId || localStorage.getItem('activeProjectId');
      if (savedProjectId) {
        const found = projects.find((p) => p.id === savedProjectId);
        if (found) {
          setActiveProject(found);
        } else {
          setError(`Project profile "${savedProjectId}" is missing or deleted.`);
          if (projects.length > 0) {
            setActiveProject(projects[0]);
          }
        }
      } else {
        if (projects.length > 0) {
          setActiveProject(projects[0]);
        }
      }
    } catch (err: any) {
      setError('Failed to hydrate project workspace selection.');
    } finally {
      setIsLoading(false);
    }
  }, [projects, initialSelectedId]);

  const selectProject = (id: string) => {
    setError(null);
    const start = performance.now();
    const found = projects.find((p) => p.id === id);
    if (found) {
      setActiveProject(found);
      try {
        localStorage.setItem('activeProjectId', id);
      } catch (e) {
        // Fallback for isolated test envs without localStorage
      }
      const duration = performance.now() - start;
      if (duration > 50) {
        console.warn(`[ProjectContext] Workspace state transition took ${duration.toFixed(2)}ms`);
      }
    } else {
      setError(`Cannot switch workspace: project profile "${id}" does not exist.`);
    }
  };

  return (
    <ProjectContext.Provider value={{ projects, activeProject, error, selectProject, isLoading }}>
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
