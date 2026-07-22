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
      className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors"
    >
      <ChevronLeftIcon className="w-4 h-4" />
      Back to campaigns
    </button>

    <div className="panel p-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="space-y-2">
          <span className="tag bg-indigo-50 text-indigo-700 border border-indigo-200">
            {campaign.status}
          </span>
          <h2 className="text-2xl font-bold text-slate-900">{campaign.title}</h2>
          <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">{campaign.description}</p>
          <div className="flex flex-wrap gap-4 pt-2 text-xs text-slate-500">
            <span>
              Channel: <strong className="text-slate-900">{campaign.channel}</strong>
            </span>
            <span>
              Last updated: <strong className="text-slate-900">{campaign.updatedAt}</strong>
            </span>
            <span>
              Creatives: <strong className="text-slate-900">{campaign.creatives.length}</strong>
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
        <h3 className="text-base font-bold text-slate-900">Creative assets</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {campaign.creatives.map((creative) => (
            <article key={creative.id} className="panel overflow-hidden">
              <div className="h-36 bg-gradient-to-br from-indigo-50 to-slate-100 border-b border-slate-200 flex items-end p-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">{creative.type}</p>
                  <p className="text-sm font-semibold text-slate-900 mt-1">{creative.headline}</p>
                </div>
              </div>
              <div className="px-4 py-3 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-mono">{creative.aspectRatio}</span>
                <div className="flex gap-3">
                  <button type="button" className="font-semibold text-indigo-600 hover:underline">
                    Edit
                  </button>
                  <button type="button" className="font-semibold text-slate-600 hover:text-slate-900">
                    Export
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <aside className="space-y-4">
        <h3 className="text-base font-bold text-slate-900">Campaign timeline</h3>
        <div className="panel p-5 space-y-4">
          {['Brief approved', 'Copy drafted', 'Visuals in review', 'Ready to publish'].map((step, idx) => (
            <div key={step} className="flex gap-3">
              <div
                className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                  idx < 2 ? 'bg-indigo-600 shadow-sm' : 'bg-slate-300'
                }`}
              />
              <div>
                <p className="text-sm font-medium text-slate-900">{step}</p>
                {idx < 2 && <p className="text-xs text-emerald-700 font-semibold mt-0.5">Completed</p>}
              </div>
            </div>
          ))}
        </div>

        <div className="panel p-5 bg-indigo-50/50 border-indigo-200">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-800">Preview headline</p>
          <p className="text-sm font-semibold text-slate-900 mt-2">&ldquo;{campaign.previewHeadline}&rdquo;</p>
        </div>
      </aside>
    </div>
  </div>
);
