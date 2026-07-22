import React, { useState } from 'react';
import { Spinner } from '../ui/Spinner';

const PHOTOSHOOT_STYLES = ['Studio', 'Ingredient', 'In Use', 'Contextual'] as const;

interface PhotoshootViewProps {
  style: string;
  scenePrompt: string;
  isGenerating: boolean;
  generatedPhoto: string | null;
  onStyleChange: (style: string) => void;
  onPromptChange: (value: string) => void;
  onGenerate: (e: React.FormEvent) => void;
}

export const PhotoshootView: React.FC<PhotoshootViewProps> = ({
  style,
  scenePrompt,
  isGenerating,
  generatedPhoto,
  onStyleChange,
  onPromptChange,
  onGenerate,
}) => {
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [savedToLibrary, setSavedToLibrary] = useState(false);

  const handleDownload = () => {
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2000);
  };

  const handleSaveToLibrary = () => {
    setSavedToLibrary(true);
    setTimeout(() => setSavedToLibrary(false), 2000);
  };

  // Preset backdrop background gradient styles by theme
  const backdropGradients: Record<string, string> = {
    Studio: 'from-slate-900 via-indigo-950 to-slate-900 text-indigo-200',
    Ingredient: 'from-amber-900 via-orange-950 to-amber-950 text-amber-200',
    'In Use': 'from-emerald-950 via-teal-900 to-slate-900 text-teal-200',
    Contextual: 'from-blue-950 via-slate-900 to-indigo-950 text-blue-200'
  };

  const activeGradient = backdropGradients[style] || backdropGradients.Studio;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Visual studio</p>
        <h2 className="text-2xl font-bold text-brand-text mt-1">AI Photoshoot</h2>
        <p className="text-sm text-brand-muted mt-1 max-w-2xl">
          Generate product imagery with controlled lighting, context, and composition presets.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="panel p-6 space-y-5">
          <form onSubmit={onGenerate} className="space-y-5">
            <div>
              <label className="text-sm font-semibold text-brand-text block mb-2">Scene preset</label>
              <div className="grid grid-cols-2 gap-2">
                {PHOTOSHOOT_STYLES.map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    onClick={() => onStyleChange(theme)}
                    className={`px-4 py-3 rounded-xl text-sm font-semibold border transition-all ${
                      style === theme
                        ? 'bg-brand-primary text-white border-brand-primary shadow-soft'
                        : 'bg-white text-brand-muted border-brand-border hover:border-brand-primary/40'
                    }`}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="scene-prompt" className="text-sm font-semibold text-brand-text block mb-2">
                Scene description
              </label>
              <input
                id="scene-prompt"
                type="text"
                required
                value={scenePrompt}
                onChange={(e) => onPromptChange(e.target.value)}
                placeholder="e.g. Set product on a clean wood table with warm ambient sunlight"
                className="input-field"
              />
            </div>

            <button type="submit" disabled={isGenerating} className="btn-primary w-full sm:w-auto">
              {isGenerating ? 'Generating Scene...' : 'Render Product Scene'}
            </button>
          </form>
        </div>

        <div className="panel p-6 flex flex-col min-h-[360px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-brand-text">Preview Generation</h3>
            {generatedPhoto && (
              <span className="tag bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                Render Successful
              </span>
            )}
          </div>

          {isGenerating && (
            <div className="flex-1 flex items-center justify-center p-8">
              <Spinner label="Rendering product photoshoot with AI backdrop generator..." />
            </div>
          )}

          {!isGenerating && !generatedPhoto && (
            <div className="flex-1 rounded-xl border-2 border-dashed border-brand-border flex items-center justify-center text-sm text-brand-muted p-8">
              Your render preview will appear here
            </div>
          )}

          {!isGenerating && generatedPhoto && (
            <div className="flex-1 flex flex-col gap-4">
              {/* Dynamic Visual Mock Backdrop Container */}
              <div className={`flex-1 rounded-xl bg-gradient-to-br ${activeGradient} border border-brand-border p-6 flex flex-col justify-between relative overflow-hidden min-h-[220px]`}>
                <div className="absolute inset-0 bg-radial-vignette opacity-40 pointer-events-none" />
                
                <div className="flex justify-between items-start z-10">
                  <span className="px-2.5 py-1 rounded-md bg-black/40 backdrop-blur-md border border-white/10 text-[11px] font-bold tracking-wide uppercase text-white">
                    {style} Preset
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white/10 backdrop-blur-md text-[10px] text-white/80 font-mono">
                    1024 &times; 1024 px &middot; 1:1
                  </span>
                </div>

                {/* Simulated Visual Product Artwork */}
                <div className="my-auto text-center space-y-2 z-10">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-2xl shadow-xl">
                    📸
                  </div>
                  <p className="text-sm font-semibold text-white/90 max-w-xs mx-auto line-clamp-2">
                    &ldquo;{scenePrompt || 'Minimalist studio setup'}&rdquo;
                  </p>
                </div>

                <div className="flex items-center justify-between text-[11px] text-white/60 z-10">
                  <span>AI Backdrop Engine &middot; Active</span>
                  <span>Lighting: Studio Softbox</span>
                </div>
              </div>

              {/* Status and Action Buttons */}
              <div className="space-y-3 pt-1">
                <div>
                  <p className="font-bold text-emerald-600 text-sm">Render Successful</p>
                  <p className="text-sm text-brand-muted mt-0.5">{generatedPhoto}</p>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="btn-secondary py-2 text-xs"
                  >
                    {downloadSuccess ? '✓ Image Downloaded' : 'Download HD Image'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveToLibrary}
                    className="btn-primary py-2 text-xs"
                  >
                    {savedToLibrary ? '✓ Saved to Asset Library' : 'Save to Asset Library'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
