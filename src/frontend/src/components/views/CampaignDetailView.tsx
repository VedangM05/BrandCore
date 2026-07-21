import React from 'react';
import { Campaign } from '../../types';
import { ChevronLeftIcon, PlusIcon } from '../icons';

interface CampaignDetailViewProps {
  campaign: Campaign;
  onBack: () => void;
}

export const CampaignDetailView: React.FC<CampaignDetailViewProps> = ({ campaign, onBack }) => (
  <div className="space-y-6">
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-muted hover:text-brand-primary transition-colors"
    >
      <ChevronLeftIcon className="w-4 h-4" />
      Back to campaigns
    </button>

    <div className="panel p-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="space-y-2">
          <span className="tag bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
            {campaign.status}
          </span>
          <h2 className="text-2xl font-bold text-brand-text">{campaign.title}</h2>
          <p className="text-sm text-brand-muted max-w-2xl leading-relaxed">{campaign.description}</p>
          <div className="flex flex-wrap gap-4 pt-2 text-xs text-brand-muted">
            <span>
              Channel: <strong className="text-brand-text">{campaign.channel}</strong>
            </span>
            <span>
              Last updated: <strong className="text-brand-text">{campaign.updatedAt}</strong>
            </span>
            <span>
              Creatives: <strong className="text-brand-text">{campaign.creatives.length}</strong>
            </span>
          </div>
        </div>
        <button type="button" className="btn-primary shrink-0">
          <PlusIcon className="w-4 h-4" />
          Add asset
        </button>
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <h3 className="text-sm font-bold text-brand-text">Creative assets</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {campaign.creatives.map((creative) => (
            <article key={creative.id} className="panel overflow-hidden">
              <div className="h-36 bg-gradient-to-br from-slate-100 to-indigo-50 border-b border-brand-border flex items-end p-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-brand-primary">{creative.type}</p>
                  <p className="text-sm font-semibold text-brand-text mt-1">{creative.headline}</p>
                </div>
              </div>
              <div className="px-4 py-3 flex items-center justify-between text-xs">
                <span className="text-brand-muted">{creative.aspectRatio}</span>
                <div className="flex gap-2">
                  <button type="button" className="font-semibold text-brand-primary hover:underline">
                    Edit
                  </button>
                  <button type="button" className="font-semibold text-brand-muted hover:text-brand-text">
                    Export
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <aside className="space-y-4">
        <h3 className="text-sm font-bold text-brand-text">Campaign timeline</h3>
        <div className="panel p-5 space-y-4">
          {['Brief approved', 'Copy drafted', 'Visuals in review', 'Ready to publish'].map((step, idx) => (
            <div key={step} className="flex gap-3">
              <div
                className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                  idx < 2 ? 'bg-brand-primary' : 'bg-brand-border'
                }`}
              />
              <div>
                <p className="text-sm font-medium text-brand-text">{step}</p>
                {idx < 2 && <p className="text-xs text-brand-muted mt-0.5">Completed</p>}
              </div>
            </div>
          ))}
        </div>

        <div className="panel p-5 bg-brand-accent-soft border-orange-200">
          <p className="text-xs font-bold uppercase tracking-wider text-orange-700">Preview headline</p>
          <p className="text-sm font-semibold text-brand-text mt-2">{campaign.previewHeadline}</p>
        </div>
      </aside>
    </div>
  </div>
);
