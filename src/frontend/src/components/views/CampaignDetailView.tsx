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
      className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-indigo-400 transition-colors"
    >
      <ChevronLeftIcon className="w-4 h-4" />
      Back to campaigns
    </button>

    <div className="panel p-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="space-y-2">
          <span className="tag bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            {campaign.status}
          </span>
          <h2 className="text-2xl font-bold text-white">{campaign.title}</h2>
          <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">{campaign.description}</p>
          <div className="flex flex-wrap gap-4 pt-2 text-xs text-slate-400">
            <span>
              Channel: <strong className="text-white">{campaign.channel}</strong>
            </span>
            <span>
              Last updated: <strong className="text-white">{campaign.updatedAt}</strong>
            </span>
            <span>
              Creatives: <strong className="text-white">{campaign.creatives.length}</strong>
            </span>
          </div>
        </div>
        <button type="button" className="btn-primary shrink-0 px-5 py-2.5">
          <PlusIcon className="w-4 h-4" />
          Add asset
        </button>
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <h3 className="text-base font-bold text-white">Creative assets</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {campaign.creatives.map((creative) => (
            <article key={creative.id} className="panel overflow-hidden">
              <div className="h-36 bg-gradient-to-br from-slate-900 to-indigo-950/60 border-b border-slate-800 flex items-end p-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">{creative.type}</p>
                  <p className="text-sm font-semibold text-white mt-1">{creative.headline}</p>
                </div>
              </div>
              <div className="px-4 py-3 flex items-center justify-between text-xs">
                <span className="text-slate-400 font-mono">{creative.aspectRatio}</span>
                <div className="flex gap-3">
                  <button type="button" className="font-semibold text-indigo-400 hover:underline">
                    Edit
                  </button>
                  <button type="button" className="font-semibold text-slate-400 hover:text-white">
                    Export
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <aside className="space-y-4">
        <h3 className="text-base font-bold text-white">Campaign timeline</h3>
        <div className="panel p-5 space-y-4">
          {['Brief approved', 'Copy drafted', 'Visuals in review', 'Ready to publish'].map((step, idx) => (
            <div key={step} className="flex gap-3">
              <div
                className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                  idx < 2 ? 'bg-indigo-500 shadow-sm shadow-indigo-500' : 'bg-slate-700'
                }`}
              />
              <div>
                <p className="text-sm font-medium text-white">{step}</p>
                {idx < 2 && <p className="text-xs text-emerald-400 mt-0.5">Completed</p>}
              </div>
            </div>
          ))}
        </div>

        <div className="panel p-5 bg-slate-900 border-indigo-500/20">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-400">Preview headline</p>
          <p className="text-sm font-semibold text-white mt-2">&ldquo;{campaign.previewHeadline}&rdquo;</p>
        </div>
      </aside>
    </div>
  </div>
);
