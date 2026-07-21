import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProjectProvider, Project } from '../../src/frontend/src/context/ProjectContext';
import { DashboardShell } from '../../src/frontend/src/components/DashboardShell';

const MOCK_PROJECTS: Project[] = [
  { id: 'p-1', name: 'Project One', description: 'Desc One' },
  { id: 'p-2', name: 'Project Two', description: 'Desc Two' },
];

const mockLogout = jest.fn();
const mockNavigate = jest.fn();

jest.mock('../../src/frontend/src/context/AuthContext', () => {
  const actual = jest.requireActual('../../src/frontend/src/context/AuthContext');
  return {
    ...actual,
    useAuth: () => ({
      user: { userId: 'user-1', email: 'test@example.com', role: 'user' },
      isLoading: false,
      isAuthenticated: true,
      error: null,
      login: jest.fn(),
      signup: jest.fn(),
      logout: mockLogout,
      clearError: jest.fn(),
    }),
  };
});

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('DashboardShell Integration & Component Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    mockLogout.mockClear();
    mockNavigate.mockClear();
  });

  const renderShell = () =>
    render(
      <MemoryRouter>
        <ProjectProvider initialProjects={MOCK_PROJECTS}>
          <DashboardShell />
        </ProjectProvider>
      </MemoryRouter>
    );

  test('should render shell framework layout and active workspace info', () => {
    renderShell();

    expect(screen.getByRole('navigation', { name: /Sidebar Navigation/i })).toBeInTheDocument();

    const select = screen.getByTestId('workspace-select') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe('p-1');

    expect(screen.getByRole('heading', { level: 1, name: 'Project One' })).toBeInTheDocument();
    expect(screen.getByText('Desc One')).toBeInTheDocument();
    expect(screen.getByText(/BrandCore Systems/i)).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  test('should switch active project and update workspace context on select option change', () => {
    renderShell();

    const select = screen.getByTestId('workspace-select') as HTMLSelectElement;

    fireEvent.change(select, { target: { value: 'p-2' } });

    expect(select.value).toBe('p-2');
    expect(screen.getByRole('heading', { level: 1, name: 'Project Two' })).toBeInTheDocument();
    expect(screen.getByText('Desc Two')).toBeInTheDocument();
    expect(localStorage.getItem('activeProjectId')).toBe('p-2');
  });

  test('should sign out and redirect to login', () => {
    renderShell();

    fireEvent.click(screen.getByTestId('logout-button'));

    expect(mockLogout).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  test('should render 100 dummy elements in active workspace for performance benchmark', () => {
    renderShell();

    const libraryLink = screen.getByRole('link', { name: /Assets Library/i });
    fireEvent.click(libraryLink);

    const cards = screen.getAllByTestId('dummy-card');
    expect(cards).toHaveLength(100);
    expect(screen.getByText(/Rendering 100 elements/i)).toBeInTheDocument();
  });

  test('should render global error banner layout variant on error state', () => {
    render(
      <MemoryRouter>
        <ProjectProvider initialProjects={MOCK_PROJECTS} initialSelectedId="non-existent">
          <DashboardShell />
        </ProjectProvider>
      </MemoryRouter>
    );

    const banner = screen.getByRole('alert');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/profile "non-existent" is missing or deleted/);
  });

  test('should render and interact with the Business DNA scanner tab', async () => {
    const mockDnaScanResponse = {
      success: true,
      title: 'NIKE',
      colors: ['#4f46e5', '#f97316', '#0ea5e9', '#10b981'],
      tone: 'Modern, Professional, and Innovative',
      font_pairings: 'Plus Jakarta Sans & Inter',
    };

    let resolveFetch: any;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = () => resolve({
        ok: true,
        json: () => Promise.resolve(mockDnaScanResponse),
      } as Response);
    });

    const originalFetch = (global as any).fetch;
    const mockFetch = jest.fn().mockImplementation(() => fetchPromise as Promise<Response>);
    (global as any).fetch = mockFetch;

    renderShell();

    const dnaTabLink = screen.getByRole('link', { name: /Business DNA/i });
    fireEvent.click(dnaTabLink);

    const urlInput = screen.getByPlaceholderText('https://yourbrand.com');
    fireEvent.change(urlInput, { target: { value: 'https://nike.com' } });

    const scanButton = screen.getByRole('button', { name: /Scan DNA/i });
    fireEvent.click(scanButton);

    await waitFor(() => {
      expect(screen.getByText(/Analyzing brand colors/i)).toBeInTheDocument();
    });

    await act(async () => {
      resolveFetch();
    });

    await waitFor(() => {
      expect(screen.getByText('NIKE')).toBeInTheDocument();
    });

    expect(screen.getByText('Modern, Professional, and Innovative')).toBeInTheDocument();

    (global as any).fetch = originalFetch;
  });

  test('should render and interact with the AI Photoshoot tab', () => {
    jest.useFakeTimers();
    renderShell();

    const photoshootLink = screen.getByRole('link', { name: /AI Photoshoot/i });
    fireEvent.click(photoshootLink);

    const inUseButton = screen.getByRole('button', { name: 'In Use' });
    fireEvent.click(inUseButton);

    const promptInput = screen.getByPlaceholderText(/e.g. Set product on a clean wood table/i);
    fireEvent.change(promptInput, { target: { value: 'on a luxury leather stand' } });

    const renderButton = screen.getByRole('button', { name: /Render Product Scene/i });
    fireEvent.click(renderButton);

    expect(screen.getByText(/Rendering product photoshoot/i)).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1200);
    });

    expect(screen.getByText('Render Successful')).toBeInTheDocument();
    expect(screen.getByText(/Generated a high-fidelity image using the "In Use" theme/i)).toBeInTheDocument();

    jest.useRealTimers();
  });

  test('should render and interact with the Campaign Creator tab', () => {
    renderShell();

    const campaignLink = screen.getByRole('link', { name: /AI Brief Writer/i });
    fireEvent.click(campaignLink);

    expect(screen.getByText('Campaign Ad Copy Planner')).toBeInTheDocument();
    expect(screen.getByText('Introducing Your Summer Collection')).toBeInTheDocument();
  });
});
