import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Spinner } from '../ui/Spinner';
import { GlobeIcon, CheckIcon } from '../icons';
import { useProject } from '../../context/ProjectContext';
import { apiRequestJson, getAssetBlobUrl, saveAssetEdit } from '../../api/client';
import { prefersReducedMotion } from '../../lib/motion';
import { AssetEditor, EditableTextLayer, EditorState } from '../editor/AssetEditor';

const PHOTOSHOOT_STYLES = ['Studio', 'Ingredient', 'In Use', 'Contextual'] as const;

// Mirrors the backend's GENERATION_DIMENSIONS (photoshoot.service.ts). 'square'
// keeps the original 1024x1024 default (not the 1080 grid used elsewhere) when
// no aspect is sent - see generatePhotoshootImage's fallback in photoshoot.service.ts.
const ASPECT_OPTIONS: Array<{ id: 'square' | 'portrait' | 'story'; label: string; width: number; height: number }> = [
  { id: 'square', label: 'Square · 1:1', width: 1024, height: 1024 },
  { id: 'portrait', label: 'Portrait · 4:5', width: 1080, height: 1350 },
  { id: 'story', label: 'Story · 9:16', width: 1080, height: 1920 },
];

interface GeneratedAsset {
  id: string;
  name: string;
}

interface GenerateImageResponse {
  asset: GeneratedAsset;
}

export const PhotoshootView: React.FC = () => {
  const { activeProject } = useProject();

  const [style, setStyle] = useState<string>(PHOTOSHOOT_STYLES[0]);
  const [aspect, setAspect] = useState<(typeof ASPECT_OPTIONS)[number]['id']>('square');
  const [resultDims, setResultDims] = useState(ASPECT_OPTIONS[0]);
  const [scenePrompt, setScenePrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asset, setAsset] = useState<GeneratedAsset | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useGSAP(
    () => {
      if (!imageUrl || prefersReducedMotion() || !previewRef.current) return;
      gsap.fromTo(previewRef.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' });
    },
    { dependencies: [imageUrl] }
  );

  // Revoke the previous object URL whenever we replace it or unmount, so we
  // don't leak blob memory across repeated generations.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const loadPreview = async (assetId: string) => {
    const url = await getAssetBlobUrl(assetId);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = url;
    setImageUrl(url);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scenePrompt.trim() || !activeProject) return;

    setIsGenerating(true);
    setError(null);
    setAsset(null);
    setImageUrl(null);
    setSaved(false);

    const requestedAspectOption = ASPECT_OPTIONS.find((o) => o.id === aspect) || ASPECT_OPTIONS[0];

    try {
      const data = await apiRequestJson<GenerateImageResponse>('/api/photoshoot/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // activeProject.id is the real crawl_results id for any project
          // synced from a scan (see ProjectContext.tsx) - fall back to
          // url/name only for stale pre-migration localStorage entries.
          brandDnaId: activeProject.id || activeProject.url || activeProject.name,
          scenePrompt,
          style,
          aspect,
        }),
      });

      setAsset(data.asset);
      setResultDims(requestedAspectOption);
      await loadPreview(data.asset.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Image generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveEdit = async (result: { blob: Blob; editorState: EditorState }) => {
    if (!asset) return;
    setIsSaving(true);
    setError(null);
    try {
      await saveAssetEdit(asset.id, result.blob, result.editorState);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(result.blob);
      objectUrlRef.current = url;
      setImageUrl(url);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save your edits');
    } finally {
      setIsSaving(false);
    }
  };

  const emptyTextLayers: EditableTextLayer[] = [];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-brand-muted">Visual studio</p>
        <h2 className="font-display text-3xl tracking-tighter text-brand-text mt-1">AI Photoshoot</h2>
        <p className="text-sm text-brand-muted mt-1.5 max-w-2xl leading-relaxed">
          Generates a real on-brand scene image from a FLUX-backed model, grounded in your scanned brand colors —
          then edit it directly: add text, crop, and adjust filters.
        </p>
      </div>

      {!activeProject && (
        <div className="panel p-10 text-center space-y-4">
          <div className="w-11 h-11 rounded-md bg-brand-sunken text-brand-muted flex items-center justify-center mx-auto">
            <GlobeIcon className="w-5 h-5" />
          </div>
          <h3 className="text-base font-semibold text-brand-text">No brand scanned yet</h3>
          <p className="text-sm text-brand-muted max-w-sm mx-auto leading-relaxed">
            Scan a website on the Business DNA tab first — the render is grounded in that brand's colors.
          </p>
        </div>
      )}

      {activeProject && (
        <div className="space-y-5">
          <div className="panel p-6 space-y-5">
            <form onSubmit={handleGenerate} className="space-y-5">
              <div>
                <label className="text-sm font-medium text-brand-text block mb-2">Scene preset</label>
                <div className="grid grid-cols-2 gap-2">
                  {PHOTOSHOOT_STYLES.map((theme) => (
                    <button
                      key={theme}
                      type="button"
                      onClick={() => setStyle(theme)}
                      className={`px-4 py-2.5 rounded-md text-sm font-medium border transition-colors ${
                        style === theme
                          ? 'bg-brand-ink text-brand-ink-text border-brand-ink'
                          : 'bg-brand-surface text-brand-text border-brand-border hover:border-brand-border-strong'
                      }`}
                    >
                      {theme}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-brand-text block mb-2">
                  Format &middot; sets composition before generating, not just a crop after
                </label>
                <div className="flex flex-wrap gap-2">
                  {ASPECT_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setAspect(option.id)}
                      className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                        aspect === option.id
                          ? 'bg-brand-ink text-brand-ink-text border-brand-ink'
                          : 'bg-brand-surface text-brand-muted border-brand-border hover:border-brand-border-strong'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="scene-prompt" className="text-sm font-medium text-brand-text block mb-2">
                  Scene description
                </label>
                <input
                  id="scene-prompt"
                  type="text"
                  required
                  value={scenePrompt}
                  onChange={(e) => setScenePrompt(e.target.value)}
                  placeholder="e.g. Set product on a clean wood table with warm ambient sunlight"
                  className="input-field"
                />
              </div>

              <button type="submit" disabled={isGenerating} className="btn-primary w-full sm:w-auto">
                {isGenerating ? 'Generating scene…' : 'Render Product Scene'}
              </button>
            </form>

            {error && (
              <div role="alert" className="rounded-md bg-state-danger border border-[#F3C6C6] text-state-danger-text text-sm px-4 py-3">
                {error}
              </div>
            )}
          </div>

          {isGenerating && (
            <div className="panel p-10 flex items-center justify-center">
              <Spinner label="Generating with FLUX — this can take 10–30 seconds…" />
            </div>
          )}

          {!isGenerating && !imageUrl && (
            <div className="panel p-10 rounded-md border border-dashed border-brand-border-strong flex items-center justify-center text-sm text-brand-muted text-center">
              Your render preview will appear here
            </div>
          )}

          {!isGenerating && imageUrl && asset && (
            <div ref={previewRef} className="panel p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-brand-text">Edit your render</h3>
                {saved && (
                  <span className="text-xs font-medium text-state-success-text bg-state-success px-2.5 py-1 rounded-md inline-flex items-center gap-1.5">
                    <CheckIcon className="w-3.5 h-3.5" />
                    Saved
                  </span>
                )}
              </div>
              <AssetEditor
                imageUrl={imageUrl}
                nativeWidth={resultDims.width}
                nativeHeight={resultDims.height}
                initialTextLayers={emptyTextLayers}
                onSave={handleSaveEdit}
                isSaving={isSaving}
                saveLabel="Save to library"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
