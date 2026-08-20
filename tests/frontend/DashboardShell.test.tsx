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
    expect(
      screen.getByText((content, element) => element?.tagName.toLowerCase() === 'span' && /© \d{4} BrandCore/.test(content))
    ).toBeInTheDocument();
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

  test('should render the real (empty) asset library state when no assets exist yet', async () => {
    renderShell();

    const libraryLink = screen.getByRole('link', { name: /Assets Library/i });
    // AssetsLibraryView is lazy-loaded (React.lazy/Suspense) - the click
    // triggers the dynamic import, which is real async work React's
    // synchronous act() (the one fireEvent uses internally) can't wait out.
    // Without the async act() wrapper here, findByText below was racing an
    // unresolved Suspense boundary instead of polling a settled one.
    await act(async () => {
      fireEvent.click(libraryLink);
    });

    // No assets are seeded/mocked for this test's API layer, so the library
    // should show its genuine empty state rather than any placeholder grid -
    // the view used to render 100 fake cards regardless of real data.
    expect(await screen.findByText(/No assets yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('asset-card')).not.toBeInTheDocument();
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

    // BusinessDnaView is lazy-loaded (React.lazy/Suspense) - the click above
    // only starts the dynamic import; the tab's real content (vs. the
    // Suspense fallback) isn't in the DOM until it resolves.
    const urlInput = await screen.findByPlaceholderText('https://yourbrand.com');
    fireEvent.change(urlInput, { target: { value: 'https://nike.com' } });

    const scanButton = screen.getByRole('button', { name: /Scan DNA/i });
    fireEvent.click(scanButton);

    await waitFor(() => {
      expect(screen.getByText(/analyzing colors, fonts, and brand voice/i)).toBeInTheDocument();
    });

    await act(async () => {
      resolveFetch();
    });

    await waitFor(() => {
      expect(screen.getAllByText('NIKE')[0]).toBeInTheDocument();
    });

    // Tone renders as chips (Business Details tab), split from the raw
    // "Modern, Professional, and Innovative" string - not one paragraph.
    fireEvent.click(screen.getByRole('button', { name: 'Business Details' }));
    expect(screen.getByText('Modern')).toBeInTheDocument();
    expect(screen.getByText('Professional')).toBeInTheDocument();
    expect(screen.getByText('Innovative')).toBeInTheDocument();

    (global as any).fetch = originalFetch;
  });

  test('should render a real generated image on the AI Photoshoot tab', async () => {
    (global as any).URL.createObjectURL = jest.fn(() => 'blob:mock-preview-url');
    (global as any).URL.revokeObjectURL = jest.fn();

    const originalFetch = (global as any).fetch;
    const mockFetch = jest.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.startsWith('/api/photoshoot/image')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, asset: { id: 'asset-1', name: 'Leather stand scene' } }),
        });
      }
      if (typeof url === 'string' && url.includes('/download')) {
        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob(['fake-image-bytes'], { type: 'image/jpeg' })),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    (global as any).fetch = mockFetch;

    renderShell();

    const photoshootLink = screen.getByRole('link', { name: /AI Photoshoot/i });
    fireEvent.click(photoshootLink);

    // PhotoshootView is lazy-loaded (React.lazy/Suspense) - wait for the
    // dynamic import to resolve past the Suspense fallback.
    const inUseButton = await screen.findByRole('button', { name: 'In Use' });
    fireEvent.click(inUseButton);

    const promptInput = screen.getByPlaceholderText(/e.g. Set product on a clean wood table/i);
    fireEvent.change(promptInput, { target: { value: 'on a luxury leather stand' } });

    const renderButton = screen.getByRole('button', { name: /Render Product Scene/i });
    await act(async () => {
      fireEvent.click(renderButton);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/photoshoot/image',
        expect.objectContaining({ method: 'POST' })
      );
    });

    // The result renders as an editable AssetEditor (canvas-based), not a plain
    // <img> - assert its real (non-canvas) controls mounted instead.
    await waitFor(() => {
      expect(screen.getByTestId('asset-editor-stage')).toBeInTheDocument();
      expect(screen.getByText('Filters')).toBeInTheDocument();
      expect(screen.getByText('+ Add text')).toBeInTheDocument();
    });

    (global as any).fetch = originalFetch;
  });

  test('should generate a real campaign brief on the Campaigns tab via the creative API', async () => {
    const mockGenerateResponse = {
      copy: {
        headline: 'Launch Day Is Here',
        bodyText: 'Everything your team needs, in one workspace.',
        socialCopy: 'We just launched. Come see. 🚀',
      },
      qa: { score: 95 },
    };

    const originalFetch = (global as any).fetch;
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockGenerateResponse),
    } as Response);
    (global as any).fetch = mockFetch;

    renderShell();

    // Campaigns is the default tab - the generator form should already be visible.
    const promptInput = screen.getByPlaceholderText(/Announce new product release/i);
    fireEvent.change(promptInput, { target: { value: 'Announce our new dashboard' } });

    const generateButton = screen.getByRole('button', { name: /Generate brief/i });
    await act(async () => {
      fireEvent.click(generateButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Launch Day Is Here')).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/creative/generate',
      expect.objectContaining({ method: 'POST' })
    );
    expect(screen.getByText(/QA 95/i)).toBeInTheDocument();

    (global as any).fetch = originalFetch;
  });
});
