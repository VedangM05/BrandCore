import React from 'react';
import { Campaign, CampaignBrief } from '../../types';
import { PlusIcon } from '../icons';

const CAMPAIGNS: Campaign[] = [
  {
    id: 'launch-q2',
    title: 'Q2 Product Launch',
    description: 'Multi-channel rollout for the new feature set with email, social, and landing page variants.',
    tag: 'Active',
    previewHeadline: 'Everything you need to launch with confidence',
    status: 'Active',
    channel: 'Email + Social',
    updatedAt: '2 days ago',
    creatives: [
      { id: 'c1', type: 'Social Post', headline: 'Meet the new dashboard experience', aspectRatio: '1:1' },
      { id: 'c2', type: 'Email Header', headline: 'Your workflow just got an upgrade', aspectRatio: '3:1' },
    ],
  },
  {
    id: 'retention',
    title: 'Customer Retention Push',
    description: 'Re-engage dormant users with personalized offers and success stories.',
    tag: 'Draft',
    previewHeadline: 'We miss you — here is what is new',
    status: 'Draft',
    channel: 'Email',
    updatedAt: '5 days ago',
    creatives: [
      { id: 'c1', type: 'Ad Banner', headline: 'Pick up where you left off', aspectRatio: '16:9' },
    ],
  },
  {
    id: 'webinar',
    title: 'Webinar Registration',
    description: 'Drive sign-ups for the live product walkthrough and follow-up nurture sequence.',
    tag: 'Scheduled',
    previewHeadline: 'Join us for a live deep dive',
    status: 'Scheduled',
    channel: 'LinkedIn + Email',
    updatedAt: '1 week ago',
    creatives: [
      { id: 'c1', type: 'Story', headline: 'Reserve your seat today', aspectRatio: '9:16' },
      { id: 'c2', type: 'Social Post', headline: 'Live demo this Thursday', aspectRatio: '1:1' },
    ],
  },
];

const STATUS_STYLES: Record<string, string> = {
  Active: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  Draft: 'bg-slate-100 text-slate-700 border border-slate-300',
  Scheduled: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
};

interface CampaignsViewProps {
  campaignPrompt: string;
  campaignCopy: CampaignBrief | null;
  isGenerating: boolean;
  onPromptChange: (value: string) => void;
  onGenerate: (e: React.FormEvent) => void;
  onSelectCampaign: (campaign: Campaign) => void;
}

export const CampaignsView: React.FC<CampaignsViewProps> = ({
  campaignPrompt,
  campaignCopy,
  isGenerating,
  onPromptChange,
  onGenerate,
  onSelectCampaign,
}) => (
  <div className="space-y-8">
    <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Overview</p>
        <h2 className="text-2xl font-bold text-slate-900 mt-1">Campaign Command Center</h2>
        <p className="text-sm text-slate-600 mt-1 max-w-xl">
          Plan, draft, and orchestrate multi-channel marketing campaigns powered by AI agents.
        </p>
      </div>
      <button type="button" className="btn-primary self-start lg:self-auto px-5 py-2.5">
        <PlusIcon className="w-4 h-4" />
        New campaign
      </button>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="stat-card">
        <span className="text-xs font-medium text-slate-500">Active campaigns</span>
        <span className="text-3xl font-bold text-slate-900">3</span>
      </div>
      <div className="stat-card">
        <span className="text-xs font-medium text-slate-500">Assets generated</span>
        <span className="text-3xl font-bold text-indigo-600">47</span>
      </div>
      <div className="stat-card">
        <span className="text-xs font-medium text-slate-500">Ready to publish</span>
        <span className="text-3xl font-bold text-emerald-600">12</span>
      </div>
    </div>

    <div className="panel p-6 space-y-4">
      <div>
        <h3 className="text-base font-bold text-slate-900 mb-1">Quick Campaign Brief Generator</h3>
        <p className="text-xs text-slate-600">Describe a marketing goal and trigger multi-agent copy generation.</p>
      </div>

      <form onSubmit={onGenerate} className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          required
          value={campaignPrompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="e.g. Announce our spring sale to existing customers"
          className="input-field flex-1"
        />
        <button type="submit" disabled={isGenerating} className="btn-primary shrink-0 px-6">
          {isGenerating ? 'Generating...' : 'Generate brief'}
        </button>
      </form>

      {campaignCopy && (
        <div className="mt-5 p-5 rounded-xl bg-slate-50 border border-indigo-200 space-y-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Generated brief</p>
          <p className="font-bold text-slate-900 text-lg">{campaignCopy.headline}</p>
          <p className="text-sm text-slate-700">{campaignCopy.body}</p>
          <p className="text-sm text-sky-800 italic font-medium">&ldquo;{campaignCopy.social}&rdquo;</p>
        </div>
      )}
    </div>

    <div className="panel overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-900">All campaigns</h3>
        <span className="text-xs text-slate-500 font-mono">{CAMPAIGNS.length} total</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <th className="px-6 py-3 font-semibold">Campaign</th>
              <th className="px-6 py-3 font-semibold hidden md:table-cell">Channel</th>
              <th className="px-6 py-3 font-semibold">Status</th>
              <th className="px-6 py-3 font-semibold hidden sm:table-cell">Updated</th>
              <th className="px-6 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {CAMPAIGNS.map((campaign) => (
              <tr key={campaign.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <button
                    type="button"
                    onClick={() => onSelectCampaign(campaign)}
                    className="text-left group"
                  >
                    <p className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {campaign.title}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1 max-w-md">{campaign.description}</p>
                  </button>
                </td>
                <td className="px-6 py-4 text-slate-700 hidden md:table-cell">{campaign.channel}</td>
                <td className="px-6 py-4">
                  <span className={`tag ${STATUS_STYLES[campaign.status]}`}>
                    {campaign.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-500 hidden sm:table-cell">{campaign.updatedAt}</td>
                <td className="px-6 py-4 text-right">
                  <button
                    type="button"
                    onClick={() => onSelectCampaign(campaign)}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export { CAMPAIGNS };
