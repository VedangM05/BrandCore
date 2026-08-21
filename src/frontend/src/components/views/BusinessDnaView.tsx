import React, { useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { DnaResults } from '../../types';
import { Spinner } from '../ui/Spinner';
import { CheckIcon, CloseIcon } from '../icons';
import { useProject } from '../../context/ProjectContext';
import { prefersReducedMotion } from '../../lib/motion';
import { updateBrandDna } from '../../api/client';
import { BrandChatPanel } from '../dna/BrandChatPanel';

interface BusinessDnaViewProps {
  websiteUrl: string;
  isScanning: boolean;
  results: DnaResults | null;
  onUrlChange: (value: string) => void;
  onScan: (e: React.FormEvent) => void;
  /** Called after a successful correction is saved, so the parent can keep its copy and the active project in sync. */
  onDnaUpdated?: (updated: DnaResults) => void;
}

const CHECKLIST = [
  'Primary and accent color swatches',
  'Typography and font pairing',
  'Tone of voice and mission',
  'Target audience and value proposition',
];

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

interface EditableDna {
  brandName: string;
  tagline: string;
  tone: string;
  font: string;
  colors: string[];
}

// Backend tone strings are already synthesized as short comma-separated
// descriptors (e.g. "Modern, Professional, and Innovative") - split into
// chips instead of one paragraph blob so the tone reads as scannable
// keywords, not prose to parse.
function toneChips(tone: string): string[] {
  return tone
    .replace(/\band\b/gi, ',')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

// font_pairings is stored as one string like "Inter & Roboto" - split on
// the separator so each font gets its own "Aa" preview instead of just
// printing the raw string.
function fontNames(font: string): string[] {
  return font
    .split(/&|\band\b/i)
    .map((f) => f.trim())
    .filter(Boolean);
}

function toEditable(results: DnaResults): EditableDna {
  return {
    brandName: results.brandName,
    tagline: results.tagline || '',
    tone: results.tone,
    font: results.font,
    colors: [...results.colors],
  };
}

export const BusinessDnaView: React.FC<BusinessDnaViewProps> = ({
  websiteUrl,
  isScanning,
  results,
  onUrlChange,
  onScan,
  onDnaUpdated,
}) => {
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [appliedToWorkspace, setAppliedToWorkspace] = useState(false);
  const { addScannedBrand } = useProject();
  const resultsRef = useRef<HTMLDivElement>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<EditableDna | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [resultTab, setResultTab] = useState<'overview' | 'details'>('overview');

  useGSAP(
    () => {
      if (!results || prefersReducedMotion() || !resultsRef.current) return;
      gsap.fromTo(
        resultsRef.current,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }
      );
    },
    { dependencies: [results?.brandName] }
  );

  const handleCopyHex = (color: string) => {
    navigator.clipboard?.writeText(color);
    setCopiedHex(color);
    setTimeout(() => setCopiedHex(null), 2000);
  };

  const handleApplyDna = () => {
    if (results && websiteUrl) {
      addScannedBrand({
        id: results.id,
        url: websiteUrl,
        brandName: results.brandName,
        colors: results.colors,
        font: results.font,
        tone: results.tone,
        tagline: results.tagline,
      });
    }
    setAppliedToWorkspace(true);
    setTimeout(() => setAppliedToWorkspace(false), 3000);
  };

  const handleStartEdit = () => {
    if (!results) return;
    setDraft(toEditable(results));
    setSaveError(null);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setDraft(null);
    setSaveError(null);
  };

  const updateDraftColor = (index: number, value: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const colors = [...prev.colors];
      colors[index] = value;
      return { ...prev, colors };
    });
  };

  const addDraftColor = () => {
    setDraft((prev) => (prev ? { ...prev, colors: [...prev.colors, '#17160F'] } : prev));
  };

  const removeDraftColor = (index: number) => {
    setDraft((prev) => (prev ? { ...prev, colors: prev.colors.filter((_, i) => i !== index) } : prev));
  };

  const handleSaveEdit = async () => {
    if (!draft || !results?.id) return;

    const cleanedColors = draft.colors.map((c) => c.trim()).filter(Boolean);
    if (cleanedColors.length === 0 || !cleanedColors.every((c) => HEX_PATTERN.test(c))) {
      setSaveError('Every color must be a valid 6-digit hex value (e.g. #1F3B33).');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      await updateBrandDna(results.id, {
        title: draft.brandName,
        tagline: draft.tagline,
        tone: draft.tone,
        font_pairings: draft.font,
        colors: cleanedColors,
      });

      const updatedResults: DnaResults = {
        // Only brandName/tagline/tone/font/colors are actually editable
        // here - spread the rest of the existing profile (mission,
        // audience, logo, etc.) first so a correction doesn't silently
        // wipe fields the edit form never touched.
        ...results,
        brandName: draft.brandName,
        tagline: draft.tagline,
        tone: draft.tone,
        font: draft.font,
        colors: cleanedColors,
      };
      onDnaUpdated?.(updatedResults);
      setIsEditing(false);
      setDraft(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save your corrections');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-brand-muted">Brand foundation</p>
        <h2 className="font-display text-3xl tracking-tighter text-brand-text mt-1">Business DNA</h2>
        <p className="text-sm text-brand-muted mt-1.5 max-w-2xl leading-relaxed">
          Scan a website to extract its colors, typography, tone, and positioning — then reuse that
          profile for every campaign.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 panel p-6 space-y-6">
          <div className="flex items-start gap-3.5">
            <div className="w-7 h-7 rounded-md bg-brand-ink text-brand-ink-text flex items-center justify-center text-xs font-semibold shrink-0">
              1
            </div>
            <div>
              <h3 className="font-semibold text-brand-text text-[15px]">Connect a website or domain</h3>
              <p className="text-sm text-brand-muted mt-1 leading-relaxed">
                The crawler fetches the page, isolates dominant colors from the logo, and reads tone
                signals from the copy.
              </p>
            </div>
          </div>

          <form onSubmit={onScan} className="flex flex-col sm:flex-row gap-3">
            <input
              type="url"
              required
              value={websiteUrl}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder="https://yourbrand.com"
              className="input-field flex-1"
            />
            <button type="submit" disabled={isScanning} className="btn-primary shrink-0 px-6">
              {isScanning ? 'Scanning…' : 'Scan DNA'}
            </button>
          </form>

          {isScanning && (
            <div className="py-8 border-t border-brand-border">
              <Spinner label="Crawling pages and analyzing colors, fonts, and brand voice — this can take a couple of minutes on larger sites…" />
            </div>
          )}
        </div>

        <div className="lg:col-span-2 panel p-6 bg-brand-sunken">
          <h3 className="font-semibold text-brand-text mb-3.5 text-[15px]">What gets extracted</h3>
          <ul className="space-y-3 text-sm text-brand-text/85">
            {CHECKLIST.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-primary shrink-0 mt-1.5" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {results && (
        <div ref={resultsRef} className="space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              {results.logoUrl && (
                <img
                  src={results.logoUrl}
                  alt={`${results.brandName} logo`}
                  className="w-10 h-10 rounded-md border border-brand-border object-contain bg-white p-1 shrink-0"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              )}
              <h3 className="font-display text-2xl tracking-tight text-brand-text">
                Profile for {results.brandName}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {saved && !isEditing && (
                <span className="text-xs font-medium text-state-success-text bg-state-success px-2.5 py-1 rounded-md inline-flex items-center gap-1.5">
                  <CheckIcon className="w-3.5 h-3.5" />
                  Saved
                </span>
              )}
              {!isEditing && (
                <button
                  type="button"
                  onClick={handleStartEdit}
                  disabled={!results.id}
                  title={results.id ? undefined : 'Re-scan to enable editing for this profile'}
                  className="btn-secondary text-xs py-2 px-4 disabled:opacity-50"
                >
                  Edit
                </button>
              )}
              <button
                type="button"
                onClick={handleApplyDna}
                className="btn-primary text-xs py-2 px-4 inline-flex items-center gap-1.5"
              >
                {appliedToWorkspace ? (
                  <>
                    <CheckIcon className="w-3.5 h-3.5" />
                    <span>Applied</span>
                  </>
                ) : (
                  <span>Apply to campaigns</span>
                )}
              </button>
            </div>
          </div>

          <p className="text-xs text-brand-muted -mt-2 max-w-2xl leading-relaxed">
            Automated extraction gets most of this right, but not always all of it — review the colors,
            tone, and font below and correct anything that's off before generating campaigns from it.
          </p>

          {isEditing && draft ? (
            <div className="panel p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-brand-border pb-3">
                <h4 className="font-semibold text-brand-text text-sm">Editing Business DNA</h4>
                <span className="tag bg-brand-primary-soft text-brand-primary-soft-text">Unsaved changes</span>
              </div>

              {saveError && (
                <div role="alert" className="rounded-md bg-state-danger border border-[#F3C6C6] text-state-danger-text text-sm px-4 py-3">
                  {saveError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-brand-muted block mb-1.5">
                    Brand name
                  </label>
                  <input
                    type="text"
                    value={draft.brandName}
                    onChange={(e) => setDraft({ ...draft, brandName: e.target.value })}
                    className="input-field text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-brand-muted block mb-1.5">
                    Tagline
                  </label>
                  <input
                    type="text"
                    value={draft.tagline}
                    onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
                    placeholder="One-line tagline"
                    className="input-field text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-brand-muted block mb-1.5">
                  Typography pairing
                </label>
                <input
                  type="text"
                  value={draft.font}
                  onChange={(e) => setDraft({ ...draft, font: e.target.value })}
                  className="input-field text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-brand-muted block mb-1.5">
                  Tone of voice
                </label>
                <textarea
                  value={draft.tone}
                  onChange={(e) => setDraft({ ...draft, tone: e.target.value })}
                  rows={3}
                  className="input-field text-sm"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-brand-muted">
                    Color palette
                  </label>
                  <button type="button" onClick={addDraftColor} className="text-xs font-medium text-brand-primary hover:underline">
                    + Add color
                  </button>
                </div>
                <div className="flex flex-wrap gap-3">
                  {draft.colors.map((color, index) => (
                    <div key={index} className="flex items-center gap-1.5 rounded-md border border-brand-border bg-brand-sunken p-2">
                      <input
                        type="color"
                        value={HEX_PATTERN.test(color) ? color : '#000000'}
                        onChange={(e) => updateDraftColor(index, e.target.value)}
                        className="w-8 h-8 rounded border border-brand-border cursor-pointer bg-transparent"
                        aria-label={`Color swatch ${index + 1}`}
                      />
                      <input
                        type="text"
                        value={color}
                        onChange={(e) => updateDraftColor(index, e.target.value)}
                        className="w-20 text-xs font-mono bg-transparent border-none focus:outline-none text-brand-text"
                      />
                      <button
                        type="button"
                        onClick={() => removeDraftColor(index)}
                        aria-label="Remove color"
                        disabled={draft.colors.length <= 1}
                        className="text-brand-faint hover:text-state-danger-text disabled:opacity-30 transition-colors"
                      >
                        <CloseIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-brand-border">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                  className="btn-primary px-5 py-2 text-sm inline-flex items-center gap-2"
                >
                  <CheckIcon className="w-4 h-4" />
                  {isSaving ? 'Saving…' : 'Save corrections'}
                </button>
                <button type="button" onClick={handleCancelEdit} className="btn-secondary px-4 py-2 text-sm inline-flex items-center gap-2">
                  <CloseIcon className="w-4 h-4" />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="panel p-6 space-y-5">
              <div className="flex gap-1 border-b border-brand-border -mt-1 -mx-1 px-1">
                {(['overview', 'details'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setResultTab(tab)}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      resultTab === tab
                        ? 'border-brand-primary text-brand-text'
                        : 'border-transparent text-brand-muted hover:text-brand-text'
                    }`}
                  >
                    {tab === 'overview' ? 'Brand Overview' : 'Business Details'}
                  </button>
                ))}
              </div>

              {resultTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="p-4 rounded-md bg-brand-sunken border border-brand-border flex items-center gap-3.5 md:col-span-2">
                    {results.logoUrl && (
                      <img
                        src={results.logoUrl}
                        alt={`${results.brandName} logo`}
                        className="w-14 h-14 rounded-md border border-brand-border object-contain bg-white p-1.5 shrink-0"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-lg font-display tracking-tight text-brand-text truncate">{results.brandName}</p>
                      {results.tagline && <p className="text-xs text-brand-muted mt-0.5">{results.tagline}</p>}
                      {websiteUrl && (
                        <a
                          href={websiteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-brand-primary hover:underline mt-0.5 inline-block truncate max-w-full"
                        >
                          {websiteUrl}
                        </a>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-medium uppercase tracking-wide text-brand-muted block mb-2.5">
                      Color palette &middot; click to copy
                    </span>
                    <div className="grid grid-cols-4 gap-2.5">
                      {results.colors.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => handleCopyHex(color)}
                          className="group text-center focus:outline-none"
                        >
                          <div
                            className="w-full h-12 rounded-md border border-brand-border relative flex items-center justify-center transition-transform group-hover:scale-105"
                            style={{ backgroundColor: color }}
                          >
                            {copiedHex === color && (
                              <span className="text-[10px] font-semibold bg-brand-ink text-brand-ink-text px-1.5 py-0.5 rounded">
                                Copied
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-brand-muted group-hover:text-brand-text mt-1.5 block">
                            {color}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-medium uppercase tracking-wide text-brand-muted block mb-2.5">
                      Fonts
                    </span>
                    <div className="p-3.5 rounded-md bg-brand-sunken border border-brand-border flex items-center gap-6">
                      {fontNames(results.font).map((name) => (
                        <div key={name} className="text-center">
                          <p className="text-2xl font-display text-brand-text leading-none">Aa</p>
                          <p className="text-[11px] text-brand-muted mt-1.5 max-w-[6rem] truncate">{name}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {resultTab === 'details' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <span className="text-xs font-medium uppercase tracking-wide text-brand-muted block mb-2.5">
                      Brand tone of voice
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {toneChips(results.tone).map((chip) => (
                        <span key={chip} className="tag bg-brand-sunken text-brand-text border border-brand-border">
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>

                  {results.audience && (
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-brand-muted block mb-2.5">
                        Target audience
                      </span>
                      <p className="text-sm text-brand-text bg-brand-sunken p-3.5 rounded-md border border-brand-border leading-relaxed">
                        {results.audience}
                      </p>
                    </div>
                  )}

                  {results.mission && (
                    <div className="md:col-span-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-brand-muted block mb-2.5">
                        Business overview
                      </span>
                      <p className="text-sm text-brand-text bg-brand-sunken p-3.5 rounded-md border border-brand-border leading-relaxed">
                        {results.mission}
                      </p>
                    </div>
                  )}

                  {results.valueProposition && (
                    <div className="md:col-span-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-brand-muted block mb-2.5">
                        Value proposition
                      </span>
                      <p className="text-sm text-brand-text bg-brand-sunken p-3.5 rounded-md border border-brand-border leading-relaxed">
                        {results.valueProposition}
                      </p>
                    </div>
                  )}

                  {results.siteImages && results.siteImages.length > 0 && (
                    <div className="md:col-span-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-brand-muted block mb-2.5">
                        Existing imagery found on the site
                      </span>
                      <p className="text-xs text-brand-muted mb-2.5 leading-relaxed">
                        AI Photoshoot reuses a real image from here instead of generating one whenever
                        your request matches it.
                      </p>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5">
                        {results.siteImages.slice(0, 12).map((img) => (
                          <img
                            key={img.url}
                            src={img.url}
                            alt={img.alt || 'Image found on the scanned site'}
                            title={img.alt || undefined}
                            className="w-full aspect-square object-cover rounded-md border border-brand-border bg-brand-sunken"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {results.id && <BrandChatPanel brandDnaId={results.id} brandName={results.brandName} />}
        </div>
      )}
    </div>
  );
};
