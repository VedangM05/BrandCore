import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Spinner } from '../ui/Spinner';
import { GlobeIcon, CheckIcon } from '../icons';
import { useProject } from '../../context/ProjectContext';
import { apiRequestJson, saveAssetEdit, fetchCampaignIdeas, CampaignIdea } from '../../api/client';
import { prefersReducedMotion } from '../../lib/motion';
import { AssetEditor, EditorState, buildDefaultTextLayers } from '../editor/AssetEditor';

const CHANNELS = ['Ad headline', 'Twitter/X', 'LinkedIn', 'Email subject', 'Meta ad'];
const MODES = [
  { id: 'text', label: 'Text brief', hint: 'Copy only, no image - fastest' },
  { id: 'post', label: 'Image post', hint: 'Copy + a generated on-brand image' },
  { id: 'carousel', label: 'Carousel', hint: 'A multi-slide story, image per slide' },
] as const;
type Mode = (typeof MODES)[number]['id'];

// Mirrors the backend's GENERATION_DIMENSIONS (photoshoot.service.ts) - picking
// the frame before generating means composition/headline space is actually
// designed for it, not cropped into it after the fact in AssetEditor.
const ASPECT_OPTIONS: Array<{ id: 'square' | 'portrait' | 'story'; label: string; width: number; height: number }> = [
  { id: 'square', label: 'Square · 1:1', width: 1080, height: 1080 },
  { id: 'portrait', label: 'Portrait · 4:5', width: 1080, height: 1350 },
  { id: 'story', label: 'Story · 9:16', width: 1080, height: 1920 },
];

interface CreativeGenerateResponse {
  copy?: { headline?: string; bodyText?: string; socialCopy?: string };
  qa?: { score?: number };
}

interface PostGenerateResponse {
  campaignId: string;
  asset: { id: string; name: string };
  headline: string;
  bodyText: string;
  socialCopy: string;
  eyebrow?: string;
  accentColor?: string;
  rawBackgroundDataUrl: string;
}

interface CarouselSlideResponse {
  slideIndex: number;
  headline: string;
  bodyText: string;
  eyebrow?: string;
  accentColor?: string;
  asset: { id: string; name: string };
  rawBackgroundDataUrl: string;
}

interface CarouselGenerateResponse {
  carouselId: string;
  slides: CarouselSlideResponse[];
}

interface BriefResult {
  headline: string;
  bodyText: string;
  socialCopy: string;
  qaScore: number;
  channel: string;
}

export const CampaignsView: React.FC = () => {
  const { activeProject } = useProject();
  const brandName = activeProject?.name || 'this brand';

  const [mode, setMode] = useState<Mode>('text');
  const [prompt, setPrompt] = useState('');
  const [selectedChannel, setSelectedChannel] = useState(CHANNELS[0]);
  const [aspect, setAspect] = useState<(typeof ASPECT_OPTIONS)[number]['id']>('square');
  const [resultAspect, setResultAspect] = useState<(typeof ASPECT_OPTIONS)[number]['id']>('square');
  const resultDims = ASPECT_OPTIONS.find((o) => o.id === resultAspect) || ASPECT_OPTIONS[0];
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [briefResult, setBriefResult] = useState<BriefResult | null>(null);
  const [postResult, setPostResult] = useState<PostGenerateResponse | null>(null);
  const [carouselSlides, setCarouselSlides] = useState<CarouselSlideResponse[] | null>(null);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);

  const [ideas, setIdeas] = useState<CampaignIdea[]>([]);
  const [ideasLoading, setIdeasLoading] = useState(false);
  // activeProject.id is now the real server-side Brand DNA id whenever the
  // project came from a scan (see ProjectContext.tsx / project.service.ts) -
  // prefer it, falling back to url/name only for stale pre-migration
  // localStorage entries with a synthetic `brand-<timestamp>` id.
  const activeProjectKey = activeProject?.id || activeProject?.url || activeProject?.name;

  // Suggested campaign angles grounded in the brand's own DNA, so the prompt
  // field isn't a blank page - refetched whenever the active brand changes.
  useEffect(() => {
    if (!activeProjectKey) {
      setIdeas([]);
      return;
    }
    let cancelled = false;
    setIdeasLoading(true);
    fetchCampaignIdeas(activeProjectKey)
      .then((result) => {
        if (!cancelled) setIdeas(Array.isArray(result) ? result : []);
      })
      .catch(() => {
        if (!cancelled) setIdeas([]);
      })
      .finally(() => {
        if (!cancelled) setIdeasLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectKey]);

  const resultRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const hasResult = briefResult || postResult || carouselSlides;
      if (!hasResult || prefersReducedMotion() || !resultRef.current) return;
      gsap.fromTo(
        resultRef.current,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }
      );
    },
    { dependencies: [briefResult, postResult, carouselSlides, activeSlideIndex] }
  );

  const clearResults = () => {
    setBriefResult(null);
    setPostResult(null);
    setCarouselSlides(null);
    setActiveSlideIndex(0);
    setSaved(false);
  };

  const handleGenerate = async (e?: React.FormEvent, targetChannel?: string) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || !activeProject) return;

    const channel = targetChannel || selectedChannel;
    if (targetChannel) setSelectedChannel(targetChannel);
    // Captured once per request so a mid-flight aspect change doesn't relabel
    // an already-in-flight generation's result.
    const requestedAspect = aspect;

    setIsGenerating(true);
    setGenerateError(null);
    clearResults();

    // The backend resolves brand DNA by id/url/domain. activeProject.id is
    // now the real crawl_results id for any project synced from a scan (see
    // ProjectContext.tsx) - fall back to url/name only for stale
    // pre-migration localStorage entries.
    const brandDnaId = activeProject.id || activeProject.url || activeProject.name;

    try {
      if (mode === 'text') {
        const data = await apiRequestJson<CreativeGenerateResponse>('/api/creative/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandDnaId, prompt, channel }),
        });
        setBriefResult({
          headline: data.copy?.headline || `Dynamic launch for ${prompt}`,
          bodyText: data.copy?.bodyText || `Discover how we align with your goals for "${prompt}".`,
          socialCopy: data.copy?.socialCopy || `Plan smarter, ship faster with ${brandName}. #${brandName.replace(/\s+/g, '')}`,
          qaScore: data.qa?.score ?? 0,
          channel,
        });
      } else if (mode === 'post') {
        const data = await apiRequestJson<PostGenerateResponse>('/api/photoshoot/post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandDnaId, prompt, channel, aspect: requestedAspect }),
        });
        setPostResult(data);
        setResultAspect(requestedAspect);
      } else {
        const data = await apiRequestJson<CarouselGenerateResponse>('/api/photoshoot/carousel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandDnaId, prompt, slideCount: 4, aspect: requestedAspect }),
        });
        setCarouselSlides(data.slides);
        setResultAspect(requestedAspect);
      }
    } catch (err: unknown) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSavePostEdit = async (result: { blob: Blob; editorState: EditorState }) => {
    if (!postResult) return;
    setIsSaving(true);
    setGenerateError(null);
    try {
      await saveAssetEdit(postResult.asset.id, result.blob, result.editorState);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to save your edits');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSlideEdit = async (result: { blob: Blob; editorState: EditorState }) => {
    const slide = carouselSlides?.[activeSlideIndex];
    if (!slide) return;
    setIsSaving(true);
    setGenerateError(null);
    try {
      await saveAssetEdit(slide.asset.id, result.blob, result.editorState);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to save your edits');
    } finally {
      setIsSaving(false);
    }
  };

  const generatingLabel =
    mode === 'carousel' ? 'Generating carousel — this can take a couple of minutes…' : mode === 'post' ? 'Generating image and copy…' : 'Generating…';

  const activeSlide = carouselSlides?.[activeSlideIndex] || null;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-brand-muted">
          {activeProject ? activeProject.name : 'Brand workspace'}
        </p>
        <h2 className="font-display text-3xl tracking-tighter text-brand-text mt-1">Campaigns</h2>
        <p className="text-sm text-brand-muted mt-1.5 max-w-xl leading-relaxed">
          Draft copy, full image posts, or multi-slide carousels — grounded in your scanned brand DNA.
        </p>
      </div>

      {!activeProject && (
        <div className="panel p-10 text-center space-y-4">
          <div className="w-11 h-11 rounded-md bg-brand-sunken text-brand-muted flex items-center justify-center mx-auto">
            <GlobeIcon className="w-5 h-5" />
          </div>
          <h3 className="text-base font-semibold text-brand-text">No brand scanned yet</h3>
          <p className="text-sm text-brand-muted max-w-sm mx-auto leading-relaxed">
            Scan a website on the Business DNA tab first — campaign generation is grounded in that profile.
          </p>
        </div>
      )}

      {activeProject && (
        <div className="panel p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-brand-text mb-1">Generator &middot; {activeProject.name}</h3>
            <p className="text-xs text-brand-muted">Describe a marketing goal to run the copywriter and art-director agents.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMode(m.id);
                  setAspect(m.id === 'carousel' ? 'portrait' : 'square');
                  clearResults();
                }}
                title={m.hint}
                className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                  mode === m.id
                    ? 'bg-brand-primary text-white border-brand-primary'
                    : 'bg-brand-surface text-brand-muted border-brand-border hover:border-brand-border-strong hover:text-brand-text'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {(ideasLoading || ideas.length > 0) && (
            <div>
              <span className="text-xs font-medium text-brand-muted uppercase tracking-wide block mb-2">
                Suggested angles &middot; grounded in {activeProject.name}&rsquo;s DNA
              </span>
              {ideasLoading ? (
                <div className="flex gap-2">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-7 w-28 rounded-full bg-brand-sunken border border-brand-border animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {ideas.map((idea) => (
                    <button
                      key={idea.angle}
                      type="button"
                      onClick={() => setPrompt(idea.prompt)}
                      title={idea.prompt}
                      className="px-3 py-1.5 rounded-full text-xs font-medium border border-brand-border bg-brand-surface text-brand-text hover:border-brand-primary hover:text-brand-primary transition-colors"
                    >
                      {idea.angle}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                required
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={`e.g. Announce new product release for ${activeProject.name}`}
                className="input-field flex-1"
              />
              <button type="submit" disabled={isGenerating} className="btn-primary shrink-0 px-6 flex items-center gap-2 justify-center">
                {isGenerating ? (
                  <>
                    <Spinner label="" size="sm" variant="light" />
                    <span>Generating…</span>
                  </>
                ) : (
                  <span>Generate {mode === 'text' ? 'brief' : mode === 'post' ? 'post' : 'carousel'}</span>
                )}
              </button>
            </div>

            {mode !== 'carousel' && (
              <div>
                <span className="text-xs font-medium text-brand-muted uppercase tracking-wide block mb-2">
                  Target channel
                </span>
                <div className="flex flex-wrap gap-2">
                  {CHANNELS.map((channel) => (
                    <button
                      key={channel}
                      type="button"
                      onClick={() => handleGenerate(undefined, channel)}
                      disabled={isGenerating || !prompt.trim()}
                      className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors disabled:opacity-40 ${
                        selectedChannel === channel
                          ? 'bg-brand-ink text-brand-bg border-brand-ink'
                          : 'bg-brand-surface text-brand-muted border-brand-border hover:border-brand-border-strong hover:text-brand-text'
                      }`}
                    >
                      {channel}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mode !== 'text' && (
              <div>
                <span className="text-xs font-medium text-brand-muted uppercase tracking-wide block mb-2">
                  Format &middot; sets the composition before generating, not just a crop after
                </span>
                <div className="flex flex-wrap gap-2">
                  {ASPECT_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setAspect(option.id)}
                      className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                        aspect === option.id
                          ? 'bg-brand-ink text-brand-bg border-brand-ink'
                          : 'bg-brand-surface text-brand-muted border-brand-border hover:border-brand-border-strong hover:text-brand-text'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form>

          {isGenerating && (mode === 'post' || mode === 'carousel') && (
            <div className="py-8 flex justify-center">
              <Spinner label={generatingLabel} />
            </div>
          )}

          {generateError && (
            <div role="alert" className="rounded-md bg-state-danger border border-[#F3C6C6] text-state-danger-text text-sm px-4 py-3">
              {generateError}
            </div>
          )}

          {briefResult && (
            <div ref={resultRef} className="pt-1">
              <div className="rounded-md border border-brand-border bg-brand-sunken p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
                    {activeProject.name} &middot; {briefResult.channel}
                  </p>
                  <span className="tag bg-state-success text-state-success-text">QA {briefResult.qaScore}</span>
                </div>
                <p className="font-display text-xl tracking-tight text-brand-text">{briefResult.headline}</p>
                <p className="text-sm text-brand-text/80 leading-relaxed whitespace-pre-line">{briefResult.bodyText}</p>
                <p className="text-sm text-brand-primary italic">&ldquo;{briefResult.socialCopy}&rdquo;</p>
                <button
                  type="button"
                  onClick={() => handleCopy(`${briefResult.headline}\n${briefResult.bodyText}`, 'main')}
                  className="btn-secondary py-1.5 px-3 text-xs inline-flex items-center gap-1.5"
                >
                  {copiedField === 'main' ? (
                    <>
                      <CheckIcon className="w-3.5 h-3.5" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <span>Copy</span>
                  )}
                </button>
              </div>
            </div>
          )}

          {postResult && !isGenerating && (
            <div ref={resultRef} className="pt-1 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">Edit your post</p>
                {saved && (
                  <span className="text-xs font-medium text-state-success-text bg-state-success px-2.5 py-1 rounded-md inline-flex items-center gap-1.5">
                    <CheckIcon className="w-3.5 h-3.5" />
                    Saved
                  </span>
                )}
              </div>
              <AssetEditor
                imageUrl={postResult.rawBackgroundDataUrl}
                nativeWidth={resultDims.width}
                nativeHeight={resultDims.height}
                initialTextLayers={buildDefaultTextLayers(postResult.headline, postResult.eyebrow, postResult.accentColor, resultDims.width, resultDims.height)}
                onSave={handleSavePostEdit}
                isSaving={isSaving}
                saveLabel="Save to library"
              />
              <div className="rounded-md border border-brand-border bg-brand-sunken p-4 space-y-1.5">
                <p className="text-sm text-brand-text/80 leading-relaxed whitespace-pre-line">{postResult.bodyText}</p>
                <p className="text-sm text-brand-primary italic">&ldquo;{postResult.socialCopy}&rdquo;</p>
              </div>
            </div>
          )}

          {carouselSlides && activeSlide && !isGenerating && (
            <div ref={resultRef} className="pt-1 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
                  {carouselSlides.length}-slide carousel &middot; editing slide {activeSlideIndex + 1}
                </p>
                {saved && (
                  <span className="text-xs font-medium text-state-success-text bg-state-success px-2.5 py-1 rounded-md inline-flex items-center gap-1.5">
                    <CheckIcon className="w-3.5 h-3.5" />
                    Saved
                  </span>
                )}
              </div>

              <div className="flex gap-3 overflow-x-auto pb-1">
                {carouselSlides.map((slide, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveSlideIndex(idx)}
                    className={`shrink-0 w-20 aspect-[4/5] rounded-md overflow-hidden border-2 transition-colors ${
                      idx === activeSlideIndex ? 'border-brand-primary' : 'border-brand-border'
                    }`}
                  >
                    <img src={slide.rawBackgroundDataUrl} alt={`Slide ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>

              <AssetEditor
                key={activeSlideIndex}
                imageUrl={activeSlide.rawBackgroundDataUrl}
                nativeWidth={resultDims.width}
                nativeHeight={resultDims.height}
                initialTextLayers={buildDefaultTextLayers(
                  activeSlide.headline,
                  activeSlide.eyebrow,
                  activeSlide.accentColor,
                  resultDims.width,
                  resultDims.height
                )}
                onSave={handleSaveSlideEdit}
                isSaving={isSaving}
                saveLabel={`Save slide ${activeSlideIndex + 1}`}
              />
              <p className="text-xs text-brand-muted">All slides are saved to your Asset Library.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
