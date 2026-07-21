import React from 'react';
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
}) => (
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

      <div className="panel p-6 flex flex-col min-h-[320px]">
        <h3 className="text-sm font-bold text-brand-text mb-4">Preview</h3>

        {isGenerating && (
          <div className="flex-1 flex items-center justify-center">
            <Spinner label="Rendering product photoshoot with AI backdrop generator..." />
          </div>
        )}

        {!isGenerating && !generatedPhoto && (
          <div className="flex-1 rounded-xl border-2 border-dashed border-brand-border flex items-center justify-center text-sm text-brand-muted">
            Your render will appear here
          </div>
        )}

        {generatedPhoto && (
          <div className="flex-1 flex flex-col gap-4">
            <div className="flex-1 rounded-xl bg-gradient-to-br from-slate-100 to-indigo-50 border border-brand-border flex items-center justify-center text-sm font-medium text-brand-muted">
              Render preview &middot; {style}
            </div>
            <div className="space-y-1">
              <p className="font-bold text-emerald-600">Render Successful</p>
              <p className="text-sm text-brand-muted">{generatedPhoto}</p>
              <p className="text-xs text-brand-muted">1024&times;1024 px &middot; 1:1</p>
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
);
