import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectProvider, Project } from '../../src/frontend/src/context/ProjectContext';
import { DashboardShell } from '../../src/frontend/src/components/DashboardShell';

const MOCK_PROJECTS: Project[] = [
  { id: 'p-1', name: 'Project One', description: 'Desc One' },
  { id: 'p-2', name: 'Project Two', description: 'Desc Two' }
];

describe('DashboardShell Integration & Component Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('should render shell framework layout and active workspace info', () => {
    render(
      <ProjectProvider initialProjects={MOCK_PROJECTS}>
        <DashboardShell />
      </ProjectProvider>
    );

    expect(screen.getByRole('navigation', { name: /Sidebar Navigation/i })).toBeInTheDocument();

    const select = screen.getByTestId('workspace-select') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe('p-1');

    expect(screen.getByRole('heading', { level: 1, name: 'Project One' })).toBeInTheDocument();
    expect(screen.getByText('Desc One')).toBeInTheDocument();
    expect(screen.getByText(/BrandCore Systems/i)).toBeInTheDocument();
  });

  test('should switch active project and update workspace context on select option change', () => {
    render(
      <ProjectProvider initialProjects={MOCK_PROJECTS}>
        <DashboardShell />
      </ProjectProvider>
    );

    const select = screen.getByTestId('workspace-select') as HTMLSelectElement;

    fireEvent.change(select, { target: { value: 'p-2' } });

    expect(select.value).toBe('p-2');
    expect(screen.getByRole('heading', { level: 1, name: 'Project Two' })).toBeInTheDocument();
    expect(screen.getByText('Desc Two')).toBeInTheDocument();
    expect(localStorage.getItem('activeProjectId')).toBe('p-2');
  });

  test('should render 100 dummy elements in active workspace for performance benchmark', () => {
    render(
      <ProjectProvider initialProjects={MOCK_PROJECTS}>
        <DashboardShell />
      </ProjectProvider>
    );

    const cards = screen.getAllByTestId('dummy-card');
    expect(cards).toHaveLength(100);
    expect(screen.getByText(/Rendering 100 elements/i)).toBeInTheDocument();
  });

  test('should render global error banner layout variant on error state', () => {
    render(
      <ProjectProvider initialProjects={MOCK_PROJECTS} initialSelectedId="non-existent">
        <DashboardShell />
      </ProjectProvider>
    );

    const banner = screen.getByRole('alert');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/profile "non-existent" is missing or deleted/);
  });
});
