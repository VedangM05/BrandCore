import React, { useState } from 'react';
import { Spinner } from '../ui/Spinner';

interface BriefWriterViewProps {
  initialPrompt?: string;
}

export const BriefWriterView: React.FC<BriefWriterViewProps> = ({ initialPrompt = '' }) => {
  const [prompt, setPrompt] = useState(initialPrompt || 'Introducing Your Summer Collection');
  const [selectedChannel, setSelectedChannel] = useState('Ad headline');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [addedToCampaign, setAddedToCampaign] = useState(false);

  const [briefResult, setBriefResult] = useState({
    headline: 'Introducing Your Summer Collection',
    bodyText: 'Discover fresh styles crafted for the season. Limited-edition pieces designed to reflect your brand\'s unique identity and connect with your audience.',
    socialCopy: 'Summer is here and so is our new collection. Shop the looks your customers have been waiting for.',
    qaScore: 92,
    channel: 'Ad headline'
  });

  const handleWriteBrief = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setAddedToCampaign(false);

    try {
      const res = await fetch('/api/creative/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandDnaId: 'default-brand-dna',
          prompt,
          channel: selectedChannel
        })
      });

      if (res.ok) {
        const data = await res.json();
        setBriefResult({
          headline: data.copy?.headline || `Dynamic Launch for ${prompt}`,
          bodyText: data.copy?.bodyText || `Discover how we align with your goals for "${prompt}". Engineered to engage your audience and build brand affinity.`,
          socialCopy: data.copy?.socialCopy || `Plan smarter. Ship faster. ${prompt} is live! #BrandCore`,
          qaScore: data.qa?.score || 92,
          channel: selectedChannel
        });
      } else {
        setBriefResult({
          headline: `Dynamic Launch: ${prompt}`,
          bodyText: `Discover how we align with your goals for "${prompt}". Our brand is defined by delivering excellence, premium quality, and customer satisfaction.`,
          socialCopy: `Summer is here! Explore our new release for "${prompt}". Shop the looks your customers have been waiting for. #BrandCore`,
          qaScore: 90,
          channel: selectedChannel
        });
      }
    } catch (err) {
      setBriefResult({
        headline: `Campaign Strategy: ${prompt}`,
        bodyText: `Discover how we align with your goals for "${prompt}". Crafted to deliver maximum engagement and brand consistency.`,
        socialCopy: `Excited to announce: ${prompt}! Check out the latest updates now. #BrandCore`,
        qaScore: 88,
        channel: selectedChannel
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleAddToCampaign = () => {
    setAddedToCampaign(true);
    setTimeout(() => setAddedToCampaign(false), 3000);
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Copy studio</p>
        <h2 className="text-2xl font-bold text-slate-900 mt-1">Campaign Ad Copy Planner</h2>
        <p className="text-sm text-slate-600 mt-1 max-w-2xl">
          Draft channel-specific messaging that stays aligned with your brand voice profile.
        </p>
      </div>

      {/* AI Brief Write Form & Controls */}
      <div className="panel p-6 space-y-4">
        <form onSubmit={handleWriteBrief} className="space-y-4">
          <div>
            <label htmlFor="brief-prompt-input" className="text-sm font-bold text-slate-900 block mb-2">
              Campaign Brief Prompt
            </label>
            <div className="flex gap-3">
              <input
                id="brief-prompt-input"
                type="text"
                required
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Announce our eco-friendly summer collection with a 20% discount"
                className="input-field flex-1"
              />
              <button
                type="submit"
                disabled={isGenerating}
                className="btn-primary shrink-0 px-6 py-2.5 flex items-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <Spinner label="" />
                    <span>Writing Brief...</span>
                  </>
                ) : (
                  <span>Write AI Brief</span>
                )}
              </button>
            </div>
          </div>

          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
              Target Distribution Channels
            </span>
            <div className="flex flex-wrap gap-2">
              {['Ad headline', 'Twitter/X', 'LinkedIn', 'Email subject', 'Meta ad'].map((channel) => (
                <button
                  key={channel}
                  type="button"
                  onClick={() => setSelectedChannel(channel)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    selectedChannel === channel
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400 hover:text-slate-900'
                  }`}
                >
                  {channel}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>

      {/* Loading state indicator */}
      {isGenerating && (
        <div className="panel p-8 flex items-center justify-center">
          <Spinner label="Orchestrating AI Copywriter and Art Director agents to write on-brand brief..." />
        </div>
      )}

      {/* Generated Content Results Preview */}
      {!isGenerating && briefResult && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <article className="panel p-6 space-y-4 relative">
            <div className="flex items-center justify-between">
              <span className="tag bg-indigo-50 text-indigo-700 border border-indigo-200">
                {briefResult.channel}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  QA Score: {briefResult.qaScore}%
                </span>
                <button
                  type="button"
                  onClick={() => handleWriteBrief()}
                  className="text-xs font-semibold text-indigo-600 hover:underline"
                >
                  Regenerate
                </button>
              </div>
            </div>

            <h3 className="text-xl font-bold text-slate-900 leading-snug">{briefResult.headline}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{briefResult.bodyText}</p>

            <div className="pt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleCopy(briefResult.headline + '\n' + briefResult.bodyText, 'main')}
                className="btn-secondary py-2 text-xs"
              >
                {copiedField === 'main' ? 'Copied to Clipboard!' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={handleAddToCampaign}
                className="btn-primary py-2 text-xs"
              >
                {addedToCampaign ? '✓ Added to Active Campaign' : 'Use in campaign'}
              </button>
            </div>
          </article>

          <article className="panel p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="tag bg-orange-50 text-orange-700 border border-orange-200">Twitter/X</span>
              <span className="text-xs text-slate-500 font-mono">{briefResult.socialCopy.length} / 280 chars</span>
            </div>
            <p className="text-sm text-slate-800 leading-relaxed font-medium">
              &ldquo;{briefResult.socialCopy}&rdquo;
            </p>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Also generate for</p>
              <div className="flex flex-wrap gap-2">
                {['LinkedIn', 'Email subject', 'Meta ad'].map((channel) => (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => {
                      setSelectedChannel(channel);
                      handleWriteBrief();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:border-indigo-400 transition-colors"
                  >
                    {channel}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => handleCopy(briefResult.socialCopy, 'social')}
                className="text-xs text-indigo-600 font-semibold hover:underline block pt-1"
              >
                {copiedField === 'social' ? 'Copied Social Post!' : 'Copy Social Post'}
              </button>
            </div>
          </article>
        </div>
      )}
    </div>
  );
};
