import React, { useState } from 'react';

const ASSET_TYPES = ['Social Banner', 'AI Photoshoot Render', 'Campaign Ad Copy', 'Brand Voice Guide', 'Marketing Email'];
const STATUSES = ['Active', 'Approved', 'Draft'] as const;

export const AssetsLibraryView: React.FC = () => {
  const [filter, setFilter] = useState<string>('All');

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Asset manager</p>
          <h2 className="text-2xl font-bold text-brand-text mt-1">Your Generated Brand Assets</h2>
          <p className="text-sm text-brand-muted mt-1">
            Browse, download, and copy all generated campaigns and media visuals.
          </p>
        </div>
        <span className="text-xs font-medium text-brand-muted bg-white border border-brand-border px-3 py-2 rounded-xl shrink-0">
          Rendering 100 elements in gallery
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {['All', ...STATUSES].map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === status
                ? 'bg-brand-primary text-white'
                : 'bg-white text-brand-muted border border-brand-border hover:text-brand-text'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 100 }, (_, idx) => {
          const type = ASSET_TYPES[idx % ASSET_TYPES.length];
          const status = STATUSES[idx % STATUSES.length];
          const isApproved = status === 'Active' || status === 'Approved';
          const dimmed = filter !== 'All' && status !== filter;

          return (
            <div
              key={idx}
              className={`panel p-4 hover:shadow-panel transition-shadow cursor-pointer flex flex-col justify-between min-h-[120px] ${
                dimmed ? 'opacity-40' : ''
              }`}
              data-testid="dummy-card"
            >
              <div>
                <div className="text-[10px] text-brand-muted font-mono">Asset #{idx + 1}</div>
                <div className="text-sm font-semibold text-brand-text mt-1 line-clamp-1">{type}</div>
              </div>
              <div className="flex items-center justify-between mt-3">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                    isApproved ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {status}
                </span>
                <span className="text-[10px] text-brand-muted">{10 + (idx % 80)}d ago</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
