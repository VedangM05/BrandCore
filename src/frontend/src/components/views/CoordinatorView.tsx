import React, { useEffect, useState } from 'react';
import { useProject } from '../../context/ProjectContext';
import { runCoordinator, getAssetBlobUrl, CoordinatorGenerationType, CoordinatorResult } from '../../api/client';
import { BoltIcon } from '../icons';
import { Spinner } from '../ui/Spinner';

const GENERATION_TYPES: Array<{ id: CoordinatorGenerationType; label: string }> = [
  { id: 'text', label: 'Ad copy (text only)' },
  { id: 'image', label: 'Single photoshoot image' },
  { id: 'post', label: 'Campaign post (image + copy)' },
  { id: 'carousel', label: 'Carousel (multi-slide)' },
];

/**
 * The Coordinator Agent's UI entry point (see coordinator.service.ts's
 * LangGraph StateGraph and POST /api/coordinator/run). Give it a URL and it
 * scans a fresh Brand DNA; add a brief and it continues straight into
 * generating the requested output, in one call - the "one call, URL-to-
 * finished-creative" flow the backend already supports but that (until
 * this view) had no way for a user to actually reach.
 *
 * The granular flows (Business DNA scan, then separately Campaigns/AI
 * Photoshoot) are unchanged and remain the more controllable path when you
 * want to review/correct the DNA before generating, or iterate on a single
 * piece of copy - this view is for "I already trust the pipeline, just run
 * it end to end."
 */
export const CoordinatorView: React.FC = () => {
  const { addScannedBrand, selectProject } = useProject();

  const [url, setUrl] = useState('');
  const [prompt, setPrompt] = useState('');
  const [generationType, setGenerationType] = useState<CoordinatorGenerationType>('text');
  const [channel, setChannel] = useState('');
  const [scenePrompt, setScenePrompt] = useState('');
  const [style, setStyle] = useState('Studio');
  const [slideCount, setSlideCount] = useState(4);

  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CoordinatorResult | null>(null);
  const [assetUrls, setAssetUrls] = useState<string[]>([]);

  // Resolve protected asset image(s) from the result into displayable blob
  // URLs (assets require an Authorization header, so a plain <img src> to
  // the API can't be used directly - same pattern PhotoshootView/
  // CampaignsView already use via getAssetBlobUrl).
  useEffect(() => {
    if (!result?.creative) {
      setAssetUrls([]);
      return;
    }
    let cancelled = false;
    const urlsToRevoke: string[] = [];

    const loadAssetUrls = async () => {
      const assetIds: string[] = result.creative.asset?.id
        ? [result.creative.asset.id]
        : Array.isArray(result.creative.slides)
        ? result.creative.slides.map((s: any) => s.asset?.id).filter(Boolean)
        : [];

      const urls = await Promise.all(
        assetIds.map(async (id: string) => {
          try {
            return await getAssetBlobUrl(id);
          } catch {
            return null;
          }
        })
      );
      if (cancelled) {
        urls.forEach((u) => u && URL.revokeObjectURL(u));
        return;
      }
      const valid = urls.filter((u): u is string => Boolean(u));
      urlsToRevoke.push(...valid);
      setAssetUrls(valid);
    };

    loadAssetUrls();
    return () => {
      cancelled = true;
      urlsToRevoke.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [result]);

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || isRunning) return;

    setError(null);
    setResult(null);
    setIsRunning(true);

    try {
      const response = await runCoordinator({
        url: url.trim(),
        prompt: prompt.trim() || undefined,
        channel: channel.trim() || undefined,
        generationType: prompt.trim() ? generationType : undefined,
        scenePrompt: generationType === 'image' ? scenePrompt.trim() || undefined : undefined,
        style: generationType === 'image' ? style : undefined,
        slideCount: generationType === 'carousel' ? slideCount : undefined,
      });

      setResult(response);

      // Sync the scanned brand into the workspace picker, same as
      // BusinessDnaView's handleApplyDna - so a Coordinator run shows up
      // as a real project immediately, not just a one-off result on this page.
      const newProject = addScannedBrand({
        id: response.dna.id,
        url: url.trim(),
        brandName: response.dna.title,
        colors: response.dna.colors,
        tone: response.dna.tone,
        font: response.dna.font_pairings,
        tagline: response.dna.tagline,
      });
      selectProject(newProject.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Coordinator run failed';
      setError(message);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="font-display text-2xl tracking-tight text-brand-text flex items-center gap-2">
          <BoltIcon className="w-6 h-6 text-brand-primary" />
          Quick Generate
        </h2>
        <p className="text-sm text-brand-muted mt-1.5">
          One call, URL to finished creative: scans a website into Brand DNA, then - if you add a brief -
          generates directly from it. For fine-grained control, use Business DNA + Campaigns/AI Photoshoot instead.
        </p>
      </div>

      <form onSubmit={handleRun} className="panel p-6 space-y-4">
        <div>
          <label htmlFor="coordinator-url" className="block text-sm font-medium text-brand-text mb-1.5">
            Website URL
          </label>
          <input
            id="coordinator-url"
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yourbrand.com"
            className="input-field"
            data-testid="coordinator-url"
          />
        </div>

        <div>
          <label htmlFor="coordinator-prompt" className="block text-sm font-medium text-brand-text mb-1.5">
            Campaign brief <span className="text-brand-muted font-normal">(optional - leave blank to scan only)</span>
          </label>
          <textarea
            id="coordinator-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Announce our new product line"
            rows={2}
            className="input-field resize-none"
            data-testid="coordinator-prompt"
          />
        </div>

        {prompt.trim() && (
          <>
            <div>
              <label htmlFor="coordinator-type" className="block text-sm font-medium text-brand-text mb-1.5">
                Output type
              </label>
              <select
                id="coordinator-type"
                value={generationType}
                onChange={(e) => setGenerationType(e.target.value as CoordinatorGenerationType)}
                className="input-field"
                data-testid="coordinator-generation-type"
              >
                {GENERATION_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {(generationType === 'text' || generationType === 'post') && (
              <div>
                <label htmlFor="coordinator-channel" className="block text-sm font-medium text-brand-text mb-1.5">
                  Channel <span className="text-brand-muted font-normal">(optional)</span>
                </label>
                <input
                  id="coordinator-channel"
                  type="text"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  placeholder="e.g. LinkedIn, Instagram, Email"
                  className="input-field"
                />
              </div>
            )}

            {generationType === 'image' && (
              <>
                <div>
                  <label htmlFor="coordinator-scene" className="block text-sm font-medium text-brand-text mb-1.5">
                    Scene description <span className="text-brand-muted font-normal">(optional - defaults to the brief)</span>
                  </label>
                  <input
                    id="coordinator-scene"
                    type="text"
                    value={scenePrompt}
                    onChange={(e) => setScenePrompt(e.target.value)}
                    placeholder="e.g. product on a clean wood table with warm light"
                    className="input-field"
                  />
                </div>
                <div>
                  <label htmlFor="coordinator-style" className="block text-sm font-medium text-brand-text mb-1.5">
                    Style
                  </label>
                  <select id="coordinator-style" value={style} onChange={(e) => setStyle(e.target.value)} className="input-field">
                    {['Studio', 'Ingredient', 'In Use', 'Contextual'].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {generationType === 'carousel' && (
              <div>
                <label htmlFor="coordinator-slides" className="block text-sm font-medium text-brand-text mb-1.5">
                  Slide count
                </label>
                <input
                  id="coordinator-slides"
                  type="number"
                  min={2}
                  max={6}
                  value={slideCount}
                  onChange={(e) => setSlideCount(Math.max(2, Math.min(6, Number(e.target.value) || 4)))}
                  className="input-field"
                />
              </div>
            )}
          </>
        )}

        {error && (
          <div role="alert" className="rounded-md bg-state-danger border border-[#F3C6C6] text-state-danger-text text-sm px-4 py-3">
            {error}
          </div>
        )}

        <button type="submit" disabled={isRunning || !url.trim()} className="btn-primary w-full py-3" data-testid="coordinator-run">
          {isRunning ? (
            <span className="inline-flex items-center gap-2">
              <Spinner size="sm" variant="light" /> Running…
            </span>
          ) : prompt.trim() ? (
            'Scan + generate'
          ) : (
            'Scan only'
          )}
        </button>
      </form>

      {result && (
        <div className="panel p-6 space-y-5" data-testid="coordinator-result">
          <div>
            <h3 className="text-sm font-semibold text-brand-text mb-2">Brand DNA</h3>
            <div className="p-3.5 rounded-md bg-brand-primary-soft border border-brand-border">
              <p className="text-lg font-display tracking-tight text-brand-primary-soft-text">{result.dna.title}</p>
              {result.dna.tagline && <p className="text-xs text-brand-muted mt-0.5">{result.dna.tagline}</p>}
              <div className="flex gap-1.5 mt-2">
                {result.dna.colors?.map((c) => (
                  <span key={c} className="w-5 h-5 rounded-full border border-brand-border" style={{ backgroundColor: c }} title={c} />
                ))}
              </div>
            </div>
          </div>

          {result.creative && (
            <div>
              <h3 className="text-sm font-semibold text-brand-text mb-2">Generated creative</h3>

              {result.creative.copy?.headline && (
                <div className="space-y-1.5 mb-3">
                  <p className="text-sm font-semibold text-brand-text">{result.creative.copy.headline}</p>
                  <p className="text-sm text-brand-muted">{result.creative.copy.bodyText}</p>
                </div>
              )}
              {result.creative.headline && !result.creative.copy && (
                <div className="space-y-1.5 mb-3">
                  <p className="text-sm font-semibold text-brand-text">{result.creative.headline}</p>
                  <p className="text-sm text-brand-muted">{result.creative.bodyText}</p>
                </div>
              )}

              {assetUrls.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {assetUrls.map((src, i) => (
                    <img key={i} src={src} alt="Generated creative" className="rounded-md border border-brand-border w-full" />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
