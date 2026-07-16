import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { ProjectProvider, useProject, Project } from '../../src/frontend/src/context/ProjectContext';

const MOCK_PROJECTS: Project[] = [
  { id: 'p-1', name: 'Project One', description: 'Desc One' },
  { id: 'p-2', name: 'Project Two', description: 'Desc Two' }
];

describe('ProjectContext Unit Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('should hydrate default project when no selection is saved', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ProjectProvider initialProjects={MOCK_PROJECTS}>{children}</ProjectProvider>
    );

    const { result } = renderHook(() => useProject(), { wrapper });

    expect(result.current.activeProject).toEqual(MOCK_PROJECTS[0]);
    expect(result.current.error).toBeNull();
  });

  test('should hydrate from localStorage selection', () => {
    localStorage.setItem('activeProjectId', 'p-2');

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ProjectProvider initialProjects={MOCK_PROJECTS}>{children}</ProjectProvider>
    );

    const { result } = renderHook(() => useProject(), { wrapper });

    expect(result.current.activeProject).toEqual(MOCK_PROJECTS[1]);
    expect(result.current.error).toBeNull();
  });

  test('should switch workspace successfully and write to localStorage', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ProjectProvider initialProjects={MOCK_PROJECTS}>{children}</ProjectProvider>
    );

    const { result } = renderHook(() => useProject(), { wrapper });

    act(() => {
      result.current.selectProject('p-2');
    });

    expect(result.current.activeProject).toEqual(MOCK_PROJECTS[1]);
    expect(localStorage.getItem('activeProjectId')).toBe('p-2');
    expect(result.current.error).toBeNull();
  });

  test('should fail gracefully on missing project profile and set error state', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ProjectProvider initialProjects={MOCK_PROJECTS} initialSelectedId="p-999">{children}</ProjectProvider>
    );

    const { result } = renderHook(() => useProject(), { wrapper });

    expect(result.current.activeProject).toEqual(MOCK_PROJECTS[0]);
    expect(result.current.error).toContain('profile "p-999" is missing or deleted');
  });

  test('should set error when trying to switch to non-existent project id', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ProjectProvider initialProjects={MOCK_PROJECTS}>{children}</ProjectProvider>
    );

    const { result } = renderHook(() => useProject(), { wrapper });

    act(() => {
      result.current.selectProject('p-999');
    });

    expect(result.current.activeProject).toEqual(MOCK_PROJECTS[0]);
    expect(result.current.error).toContain('project profile "p-999" does not exist');
  });
});
