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

  const backdropGradients: Record<string, string> = {
    Studio: 'from-slate-900 via-indigo-950 to-slate-900 text-indigo-100',
    Ingredient: 'from-amber-950 via-orange-950 to-slate-900 text-amber-100',
    'In Use': 'from-emerald-950 via-teal-950 to-slate-900 text-emerald-100',
    Contextual: 'from-blue-950 via-slate-900 to-indigo-950 text-sky-100'
  };

  const activeGradient = backdropGradients[style] || backdropGradients.Studio;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Visual studio</p>
        <h2 className="text-2xl font-bold text-slate-900 mt-1">AI Photoshoot</h2>
        <p className="text-sm text-slate-600 mt-1 max-w-2xl">
          Generate product imagery with controlled lighting, context, and composition presets.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="panel p-6 space-y-5">
          <form onSubmit={onGenerate} className="space-y-5">
            <div>
              <label className="text-sm font-semibold text-slate-900 block mb-2">Scene preset</label>
              <div className="grid grid-cols-2 gap-2">
                {PHOTOSHOOT_STYLES.map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    onClick={() => onStyleChange(theme)}
                    className={`px-4 py-3 rounded-xl text-sm font-semibold border transition-all ${
                      style === theme
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400'
                    }`}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="scene-prompt" className="text-sm font-semibold text-slate-900 block mb-2">
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
            <h3 className="text-sm font-bold text-slate-900">Preview Generation</h3>
            {generatedPhoto && (
              <span className="tag bg-emerald-50 text-emerald-700 border border-emerald-200">
                Status: Complete
              </span>
            )}
          </div>

          {isGenerating && (
            <div className="flex-1 flex items-center justify-center p-8">
              <Spinner label="Rendering product photoshoot with AI backdrop generator..." />
            </div>
          )}

          {!isGenerating && !generatedPhoto && (
            <div className="flex-1 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center text-sm text-slate-500 p-8">
              Your render preview will appear here
            </div>
          )}

          {!isGenerating && generatedPhoto && (
            <div className="flex-1 flex flex-col gap-4">
              <div className={`flex-1 rounded-xl bg-gradient-to-br ${activeGradient} border border-slate-700 p-6 flex flex-col justify-between relative overflow-hidden min-h-[220px]`}>
                <div className="flex justify-between items-start z-10">
                  <span className="px-2.5 py-1 rounded-md bg-black/50 backdrop-blur-md border border-white/20 text-[11px] font-bold tracking-wide uppercase text-white">
                    {style} Preset
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white/20 backdrop-blur-md text-[10px] text-white font-mono">
                    1024 &times; 1024 px &middot; 1:1
                  </span>
                </div>

                <div className="my-auto text-center space-y-2 z-10">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-2xl shadow-xl">
                    📸
                  </div>
                  <p className="text-sm font-semibold text-white max-w-xs mx-auto line-clamp-2">
                    &ldquo;{scenePrompt || 'Minimalist studio setup'}&rdquo;
                  </p>
                </div>

                <div className="flex items-center justify-between text-[11px] text-white/80 z-10 font-medium">
                  <span>AI Backdrop Engine &middot; Active</span>
                  <span>Lighting: Studio Softbox</span>
                </div>
              </div>

              <div className="space-y-3 pt-1">
                <div>
                  <p className="font-bold text-emerald-700 text-sm">Render Successful</p>
                  <p className="text-sm text-slate-600 mt-0.5">{generatedPhoto}</p>
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
