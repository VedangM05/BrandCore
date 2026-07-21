import React from 'react';
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
}) => (
  <div className="space-y-8">
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Brand foundation</p>
      <h2 className="text-2xl font-bold text-brand-text mt-1">Business DNA</h2>
      <p className="text-sm text-brand-muted mt-1 max-w-2xl">
        Import your website to build a reusable brand profile — colors, typography, and voice guidelines for every asset.
      </p>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3 panel p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-8 h-8 rounded-full bg-brand-primary text-white flex items-center justify-center text-sm font-bold shrink-0">
            1
          </div>
          <div>
            <h3 className="font-bold text-brand-text">Connect your website</h3>
            <p className="text-sm text-brand-muted mt-1">We crawl public pages to infer your visual and verbal identity.</p>
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
          <button type="submit" disabled={isScanning} className="btn-primary shrink-0">
            {isScanning ? 'Scanning...' : 'Scan DNA'}
          </button>
        </form>

        {isScanning && (
          <div className="mt-8 py-10 border-t border-brand-border">
            <Spinner label="Analyzing brand colors, fonts, and brand voice..." />
          </div>
        )}
      </div>

      <div className="lg:col-span-2 panel p-6 bg-brand-elevated">
        <h3 className="font-bold text-brand-text mb-4">What we extract</h3>
        <ul className="space-y-3 text-sm text-brand-muted">
          <li className="flex gap-2">
            <span className="text-brand-primary font-bold">•</span>
            Primary and secondary color palette
          </li>
          <li className="flex gap-2">
            <span className="text-brand-primary font-bold">•</span>
            Typography pairings
          </li>
          <li className="flex gap-2">
            <span className="text-brand-primary font-bold">•</span>
            Tone of voice descriptors
          </li>
          <li className="flex gap-2">
            <span className="text-brand-primary font-bold">•</span>
            Brand name and tagline signals
          </li>
        </ul>
      </div>
    </div>

    {results && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="panel p-6">
          <h3 className="font-bold text-brand-text mb-4">Style kit</h3>
          <div className="space-y-5">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-muted">Color palette</span>
              <div className="flex gap-3 mt-3">
                {results.colors.map((color) => (
                  <div key={color} className="text-center">
                    <div
                      className="w-12 h-12 rounded-xl border border-brand-border shadow-soft"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-[10px] font-mono text-brand-muted mt-1.5 block">{color}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-muted">Typography</span>
              <p className="text-sm font-semibold mt-1">{results.font}</p>
            </div>
          </div>
        </div>

        <div className="panel p-6">
          <h3 className="font-bold text-brand-text mb-4">Voice profile</h3>
          <div className="space-y-4 text-sm">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-muted">Tone of voice</span>
              <p className="mt-1">{results.tone}</p>
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-muted">Detected brand</span>
              <p className="mt-1 text-lg font-bold text-brand-primary">{results.brandName}</p>
            </div>
          </div>
        </div>
      </div>
    )}
  </div>
);
