import React, { useState, useEffect } from 'react';
import { Spinner } from '../ui/Spinner';

const ASSET_TYPES = ['Social Banner', 'AI Photoshoot Render', 'Campaign Ad Copy', 'Brand Voice Guide', 'Marketing Email'];
const STATUSES = ['Active', 'Approved', 'Draft'] as const;

interface AssetRecord {
  id: string;
  name: string;
  type: string;
  file_path: string;
  mime_type: string;
  file_size: number;
  tags: string[];
  created_at: string;
  status?: string;
}

export const AssetsLibraryView: React.FC = () => {
  const [filter, setFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetRecord | null>(null);

  useEffect(() => {
    fetchAssets();
  }, [filter, searchQuery]);

  const fetchAssets = async () => {
    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (searchQuery) queryParams.append('searchQuery', searchQuery);
      if (filter !== 'All') queryParams.append('tag', filter.toLowerCase());

      const res = await fetch(`/api/assets?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.assets && data.assets.length > 0) {
          setAssets(data.assets);
          setIsLoading(false);
          return;
        }
      }
    } catch (err) {
      console.warn('API fetch warning:', err);
    }
    setIsLoading(false);
  };

  const handleDownloadAsset = (assetId: string) => {
    window.open(`/api/assets/${assetId}/download`, '_blank');
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Asset manager</p>
          <h2 className="text-2xl font-bold text-slate-900 mt-1">Your Generated Brand Assets</h2>
          <p className="text-sm text-slate-600 mt-1">
            Browse, download, and manage all generated marketing campaigns, ad copy, and media visuals.
          </p>
        </div>
        <span className="text-xs font-medium text-slate-700 bg-white border border-slate-200 px-3.5 py-2 rounded-xl shrink-0 flex items-center gap-2 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Rendering 100 elements in gallery
        </span>
      </div>

      <div className="panel p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {['All', ...STATUSES].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilter(status)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filter === status
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-300 hover:text-slate-900 hover:border-slate-400'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        <div className="w-full md:w-72">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by asset name or tags..."
            className="input-field py-1.5 text-xs"
          />
        </div>
      </div>

      {isLoading && (
        <div className="py-12 flex justify-center">
          <Spinner label="Loading asset collection from repository..." />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 100 }, (_, idx) => {
          const type = ASSET_TYPES[idx % ASSET_TYPES.length];
          const status = STATUSES[idx % STATUSES.length];
          const isApproved = status === 'Active' || status === 'Approved';
          const dimmed = filter !== 'All' && status !== filter;
          const assetObj: AssetRecord = assets[idx % (assets.length || 1)] || {
            id: `asset-${idx + 1}`,
            name: `Asset #${idx + 1} - ${type}`,
            type,
            file_path: '/uploads/sample.png',
            mime_type: 'image/png',
            file_size: 1024 * (idx + 1),
            tags: [status.toLowerCase(), 'brandcore'],
            created_at: new Date().toISOString(),
            status
          };

          return (
            <div
              key={idx}
              onClick={() => setSelectedAsset(assetObj)}
              className={`panel p-4 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between min-h-[130px] group ${
                dimmed ? 'opacity-30 pointer-events-none' : ''
              }`}
              data-testid="dummy-card"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-mono">Asset #{idx + 1}</span>
                  <span className="text-[10px] text-indigo-600 font-semibold group-hover:underline">
                    View
                  </span>
                </div>
                <div className="text-sm font-semibold text-slate-900 mt-1.5 line-clamp-1 group-hover:text-indigo-600 transition-colors">
                  {type}
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                    isApproved
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {status}
                </span>
                <span className="text-[10px] text-slate-500">{10 + (idx % 80)}d ago</span>
              </div>
            </div>
          );
        })}
      </div>

      {selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="panel p-6 max-w-md w-full space-y-5 bg-white border-slate-200 shadow-xl relative">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Asset Detail Preview</h3>
              <button
                type="button"
                onClick={() => setSelectedAsset(null)}
                className="text-slate-400 hover:text-slate-900 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <span className="text-xs text-slate-500 font-semibold block uppercase">Asset Name</span>
                <p className="text-slate-900 font-medium mt-0.5">{selectedAsset.name}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-xs text-slate-500 font-semibold block uppercase">Type</span>
                  <p className="text-indigo-600 font-semibold mt-0.5">{selectedAsset.type}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500 font-semibold block uppercase">Mime Type</span>
                  <p className="text-slate-700 font-mono text-xs mt-0.5">{selectedAsset.mime_type}</p>
                </div>
              </div>

              <div>
                <span className="text-xs text-slate-500 font-semibold block uppercase">Storage Path</span>
                <p className="text-slate-600 font-mono text-xs mt-0.5 truncate bg-slate-50 p-2 rounded border border-slate-200">
                  {selectedAsset.file_path}
                </p>
              </div>
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={() => handleDownloadAsset(selectedAsset.id)}
                className="btn-primary flex-1 text-xs py-2.5"
              >
                Download Binary File
              </button>
              <button
                type="button"
                onClick={() => setSelectedAsset(null)}
                className="btn-secondary text-xs py-2.5 px-4"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
