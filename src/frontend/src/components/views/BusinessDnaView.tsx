import React, { useState } from 'react';
import { DnaResults } from '../../types';
import { Spinner } from '../ui/Spinner';

interface BusinessDnaViewProps {
  websiteUrl: string;
  isScanning: boolean;
  results: DnaResults | null;
  onUrlChange: (value: string) => void;
  onScan: (e: React.FormEvent) => void;
}

export const BusinessDnaView: React.FC<BusinessDnaViewProps> = ({
  websiteUrl,
  isScanning,
  results,
  onUrlChange,
  onScan,
}) => {
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [appliedToWorkspace, setAppliedToWorkspace] = useState(false);

  const handleCopyHex = (color: string) => {
    navigator.clipboard?.writeText(color);
    setCopiedHex(color);
    setTimeout(() => setCopiedHex(null), 2000);
  };

  const handleApplyDna = () => {
    setAppliedToWorkspace(true);
    setTimeout(() => setAppliedToWorkspace(false), 3000);
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Brand foundation</p>
        <h2 className="text-2xl font-bold text-slate-900 mt-1">Business DNA Matrix</h2>
        <p className="text-sm text-slate-600 mt-1 max-w-2xl">
          Import your web presence to synthesize an AI brand positioning profile — colors, typography, voice guidelines, and positioning matrix for every campaign.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 panel p-6 space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shrink-0 shadow-md">
              1
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Connect Website or Domain</h3>
              <p className="text-sm text-slate-600 mt-1">
                Our vision & DOM analysis pipeline fetches raw markup, isolates dominant colors, and extracts tone signals.
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
              {isScanning ? 'Scanning...' : 'Scan DNA'}
            </button>
          </form>

          {isScanning && (
            <div className="py-10 border-t border-slate-200">
              <Spinner label="Analyzing brand colors, fonts, and brand voice..." />
            </div>
          )}
        </div>

        <div className="lg:col-span-2 panel p-6 bg-slate-50 border-slate-200">
          <h3 className="font-bold text-slate-900 mb-4 text-base">Extracted Intelligence Matrix</h3>
          <ul className="space-y-3.5 text-sm text-slate-700">
            <li className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
              Primary & Accent Color Swatches
            </li>
            <li className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-sky-600 shrink-0" />
              Typography Hierarchy & Font Pairings
            </li>
            <li className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
              Tone of Voice Descriptors & Mission
            </li>
            <li className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-amber-600 shrink-0" />
              Target Audience & Value Proposition
            </li>
          </ul>
        </div>
      </div>

      {results && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Synthesized Profile for {results.brandName}</h3>
            <button
              type="button"
              onClick={handleApplyDna}
              className="btn-primary text-xs py-2 px-4"
            >
              {appliedToWorkspace ? '✓ Active Brand DNA Set' : 'Apply DNA to Campaign Engine'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Style Kit Card */}
            <div className="panel p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h4 className="font-bold text-slate-900">Visual Style Kit</h4>
                <span className="tag bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Extracted
                </span>
              </div>

              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-3">
                  Color Palette (Click Hex to Copy)
                </span>
                <div className="grid grid-cols-4 gap-3">
                  {results.colors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => handleCopyHex(color)}
                      className="group text-center focus:outline-none"
                    >
                      <div
                        className="w-full h-14 rounded-xl border border-slate-300 shadow-sm group-hover:scale-105 transition-transform relative flex items-center justify-center"
                        style={{ backgroundColor: color }}
                      >
                        {copiedHex === color && (
                          <span className="text-[10px] font-bold bg-slate-900 text-white px-2 py-0.5 rounded shadow">
                            Copied!
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-slate-600 group-hover:text-slate-900 mt-1.5 block">
                        {color}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-2">
                  Typography Pairing
                </span>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{results.font}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Heading & Body Font System</p>
                  </div>
                  <span className="text-xs text-indigo-700 font-semibold bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200">
                    Optimal Contrast
                  </span>
                </div>
              </div>
            </div>

            {/* Voice & Identity Profile Card */}
            <div className="panel p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h4 className="font-bold text-slate-900">Voice & Brand Identity</h4>
                <span className="tag bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Validated
                </span>
              </div>

              <div className="space-y-4">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">
                    Tone of Voice
                  </span>
                  <p className="text-sm text-slate-800 bg-slate-50 p-3.5 rounded-xl border border-slate-200 leading-relaxed font-medium">
                    {results.tone}
                  </p>
                </div>

                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">
                    Detected Brand Identity
                  </span>
                  <div className="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-100 flex items-center justify-between">
                    <div>
                      <p className="text-lg font-bold text-indigo-900">{results.brandName}</p>
                      <p className="text-xs text-slate-600">Positioning matrix synced across workspace</p>
                    </div>
                    <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
