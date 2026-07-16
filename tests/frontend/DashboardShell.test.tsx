import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
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

  test('should render and interact with the Business DNA scanner tab', () => {
    jest.useFakeTimers();
    render(
      <ProjectProvider initialProjects={MOCK_PROJECTS}>
        <DashboardShell />
      </ProjectProvider>
    );

    const dnaTabLink = screen.getByRole('link', { name: /Business DNA/i });
    fireEvent.click(dnaTabLink);

    const urlInput = screen.getByPlaceholderText('https://yourbrand.com');
    fireEvent.change(urlInput, { target: { value: 'https://nike.com' } });

    const scanButton = screen.getByRole('button', { name: /Scan DNA/i });
    fireEvent.click(scanButton);

    expect(screen.getByText(/Analyzing typography/i)).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByText('NIKE')).toBeInTheDocument();
    expect(screen.getByText('Modern, Professional, and Innovative')).toBeInTheDocument();

    jest.useRealTimers();
  });

  test('should render and interact with the AI Photoshoot tab', () => {
    jest.useFakeTimers();
    render(
      <ProjectProvider initialProjects={MOCK_PROJECTS}>
        <DashboardShell />
      </ProjectProvider>
    );

    const photoshootLink = screen.getByRole('link', { name: /AI Photoshoot/i });
    fireEvent.click(photoshootLink);

    const inUseButton = screen.getByRole('button', { name: 'In Use' });
    fireEvent.click(inUseButton);

    const promptInput = screen.getByPlaceholderText(/e.g. Set product on a clean wood table/i);
    fireEvent.change(promptInput, { target: { value: 'on a luxury leather stand' } });

    const renderButton = screen.getByRole('button', { name: /Render Product Scene/i });
    fireEvent.click(renderButton);

    expect(screen.getByText(/Rendering product scene/i)).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1200);
    });

    expect(screen.getByText('Render Successful')).toBeInTheDocument();
    expect(screen.getByText(/Generated a high-fidelity image using the "In Use" theme/i)).toBeInTheDocument();

    jest.useRealTimers();
  });

  test('should render and interact with the Campaign Creator tab', () => {
    render(
      <ProjectProvider initialProjects={MOCK_PROJECTS}>
        <DashboardShell />
      </ProjectProvider>
    );

    const campaignLink = screen.getByRole('link', { name: /Campaign Creator/i });
    fireEvent.click(campaignLink);

    const selectCopyType = screen.getByRole('combobox', { name: '' });
    // In our header we also have a combobox (select) for project switching,
    // so we can get the specific combobox in the campaign page by target-id if needed, or by selecting options.
    // Let's change selectCopyType selector to be more specific or use screen.getAllByRole('combobox')
    const comboboxes = screen.getAllByRole('combobox');
    // The second combobox is the campaign type selector
    const campaignSelect = comboboxes[1] as HTMLSelectElement;
    fireEvent.change(campaignSelect, { target: { value: 'sale' } });

    const generateButton = screen.getByRole('button', { name: /Generate Copy/i });
    fireEvent.click(generateButton);

    expect(screen.getByText('Level Up Your Infrastructure - 40% Off')).toBeInTheDocument();
  });
});
