import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CoordinatorView } from '../../src/frontend/src/components/views/CoordinatorView';
import { ProjectProvider } from '../../src/frontend/src/context/ProjectContext';

function renderView() {
  return render(
    <ProjectProvider initialProjects={[]}>
      <CoordinatorView />
    </ProjectProvider>
  );
}

describe('CoordinatorView', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('runs a scan-only request when no brief is entered', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        brandDnaId: 'dna-1',
        dna: { id: 'dna-1', title: 'Acme Co', tagline: 'Great stuff', colors: ['#111111'], tone: 'Bold', font_pairings: 'Inter' },
        creative: null,
      }),
    });

    renderView();

    fireEvent.change(screen.getByTestId('coordinator-url'), { target: { value: 'https://acme.example.com' } });
    expect(screen.getByTestId('coordinator-run')).toHaveTextContent('Scan only');
    fireEvent.click(screen.getByTestId('coordinator-run'));

    expect(await screen.findByText('Acme Co')).toBeInTheDocument();
    expect(screen.getByText('Great stuff')).toBeInTheDocument();

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/coordinator/run',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          url: 'https://acme.example.com',
          prompt: undefined,
          channel: undefined,
          generationType: undefined,
          scenePrompt: undefined,
          style: undefined,
          slideCount: undefined,
        }),
      })
    );
  });

  it('shows generation-type options only once a brief is entered, and runs scan+generate', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        brandDnaId: 'dna-1',
        dna: { id: 'dna-1', title: 'Acme Co', colors: [], tone: 'Bold', font_pairings: 'Inter' },
        creative: { headline: 'Big Sale', bodyText: 'Everything must go', campaignId: 'c-1' },
      }),
    });

    renderView();

    expect(screen.queryByTestId('coordinator-generation-type')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('coordinator-url'), { target: { value: 'https://acme.example.com' } });
    fireEvent.change(screen.getByTestId('coordinator-prompt'), { target: { value: 'Announce our sale' } });

    expect(screen.getByTestId('coordinator-generation-type')).toBeInTheDocument();
    expect(screen.getByTestId('coordinator-run')).toHaveTextContent('Scan + generate');

    fireEvent.click(screen.getByTestId('coordinator-run'));

    expect(await screen.findByText('Big Sale')).toBeInTheDocument();
    expect(screen.getByText('Everything must go')).toBeInTheDocument();

    const call = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.prompt).toBe('Announce our sale');
    expect(body.generationType).toBe('text');
  });

  it('shows an error banner when the run fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Scan failed' }) });

    renderView();
    fireEvent.change(screen.getByTestId('coordinator-url'), { target: { value: 'https://acme.example.com' } });
    fireEvent.click(screen.getByTestId('coordinator-run'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Scan failed');
  });

  it('disables the run button while a request is in flight, and for an empty URL', async () => {
    renderView();
    expect(screen.getByTestId('coordinator-run')).toBeDisabled(); // empty URL

    fireEvent.change(screen.getByTestId('coordinator-url'), { target: { value: 'https://acme.example.com' } });
    expect(screen.getByTestId('coordinator-run')).not.toBeDisabled();

    let resolveFetch: (v: any) => void;
    global.fetch = jest.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    fireEvent.click(screen.getByTestId('coordinator-run'));
    await waitFor(() => expect(screen.getByTestId('coordinator-run')).toBeDisabled());

    resolveFetch!({
      ok: true,
      json: async () => ({ brandDnaId: 'dna-1', dna: { id: 'dna-1', title: 'Acme Co', colors: [], tone: '', font_pairings: '' }, creative: null }),
    });
    await screen.findByTestId('coordinator-result');
  });
});
