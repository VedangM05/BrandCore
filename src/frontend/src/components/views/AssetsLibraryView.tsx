import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Spinner } from '../ui/Spinner';
import { apiRequest, apiRequestJson, getAssetBlobUrl, getAssetRawBackgroundBlobUrl, saveAssetEdit } from '../../api/client';
import { CloseIcon, ImageIcon } from '../icons';
import { prefersReducedMotion } from '../../lib/motion';
import { AssetEditor, EditableTextLayer, EditorState, buildDefaultTextLayers } from '../editor/AssetEditor';

interface AssetRecord {
  id: string;
  name: string;
  type: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  tags: string[];
  metaData: Record<string, any>;
  createdAt: string;
}

const TYPE_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'All', label: 'All' },
  { value: 'image', label: 'Photoshoot' },
  { value: 'banner', label: 'Campaign post' },
  { value: 'carousel_slide', label: 'Carousel' },
];

// Sizes used when the asset was generated - needed to seed the editor's crop
// frame and default text-layer positions when re-opening from the library
// (there's no other reliable source of the image's native dimensions here).
const ASSET_DIMENSIONS: Record<string, { width: number; height: number }> = {
  image: { width: 1024, height: 1024 },
  banner: { width: 1080, height: 1080 },
  carousel_slide: { width: 1080, height: 1350 },
};
const EDITABLE_TYPES = new Set(Object.keys(ASSET_DIMENSIONS));

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 1) return 'today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

// Both the grid cards and the detail modal were pure text/metadata - no
// actual image preview anywhere in the library, despite every asset here
// being an image. Fetches the asset's blob via the existing authenticated
// helper (getAssetBlobUrl already attaches the Authorization header a plain
// <img src="/api/assets/:id/download"> can't) and revokes the object URL on
// unmount so repeatedly opening/closing the grid doesn't leak memory.
const AssetThumbnail: React.FC<{ assetId: string; alt: string; className: string }> = ({ assetId, alt, className }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    getAssetBlobUrl(assetId)
      .then((blobUrl) => {
        if (cancelled) return;
        objectUrl = blobUrl;
        setUrl(blobUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId]);

  if (failed) {
    return (
      <div className={`${className} flex items-center justify-center bg-brand-sunken text-brand-faint`}>
        <ImageIcon className="w-6 h-6" />
      </div>
    );
  }
  if (!url) {
    return <div className={`${className} bg-brand-sunken animate-pulse`} />;
  }
  return <img src={url} alt={alt} className={`${className} object-cover`} />;
};

interface EditingAsset {
  asset: AssetRecord;
  imageUrl: string;
  width: number;
  height: number;
  initialTextLayers: EditableTextLayer[];
  initialAspect?: EditorState['aspect'];
  initialFilters?: EditorState['filters'];
  initialImageScale?: number;
  initialImagePos?: { x: number; y: number };
}

export const AssetsLibraryView: React.FC = () => {
  const [filter, setFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetRecord | null>(null);
  const [editLoadingId, setEditLoadingId] = useState<string | null>(null);
  const [editingAsset, setEditingAsset] = useState<EditingAsset | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const editObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    fetchAssets();
  }, [filter, searchQuery]);

  useEffect(() => {
    return () => {
      if (editObjectUrlRef.current) URL.revokeObjectURL(editObjectUrlRef.current);
    };
  }, []);

  useGSAP(
    () => {
      if (isLoading || prefersReducedMotion()) return;
      const cards = gridRef.current?.children;
      if (!cards || cards.length === 0) return;
      gsap.fromTo(
        cards,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', stagger: { each: 0.02, from: 'start' } }
      );
    },
    { dependencies: [filter, isLoading, assets.length] }
  );

  const fetchAssets = async () => {
    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (searchQuery) queryParams.append('searchQuery', searchQuery);
      if (filter !== 'All') queryParams.append('type', filter);

      const data = await apiRequestJson<{ assets?: AssetRecord[] }>(`/api/assets?${queryParams.toString()}`);
      setAssets(data.assets || []);
    } catch (err) {
      console.warn('API fetch warning:', err);
      setAssets([]);
    }
    setIsLoading(false);
  };

  const handleDownloadAsset = async (assetId: string, assetName: string) => {
    // window.open() can't attach an Authorization header, and the download route
    // now requires one (see src/middleware/auth.middleware.ts) - fetch the bytes
    // through the authenticated client and hand the browser a blob URL instead.
    try {
      const res = await apiRequest(`/api/assets/${assetId}/download`);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = assetName || 'asset';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.warn('Download failed:', err);
    }
  };

  /**
   * Re-opens the editor for an already-saved asset. Prefers the text-free raw
   * background stashed at generation time (see photoshoot.service.ts /
   * GET /api/assets/:id/raw-background) so text layers stay independently
   * movable; falls back to the asset's own flattened file for assets that
   * never had one (single photoshoot images, or ones saved before this
   * existed). A prior edit's layers/filters/crop are restored from
   * metaData.editorState when present, so re-editing continues where the
   * last save left off instead of starting over.
   */
  const handleStartEdit = async (asset: AssetRecord) => {
    setEditError(null);
    setEditLoadingId(asset.id);
    try {
      // A best guess (the per-type generation size) - accurate for a raw
      // background. A flattened fallback file may already be a previous
      // export at different dimensions; AssetEditor reconciles against the
      // image's real pixel size once it loads, so this only seeds the very
      // first paint rather than needing to be exact here.
      const dims = ASSET_DIMENSIONS[asset.type] || { width: 1080, height: 1080 };
      const rawUrl = await getAssetRawBackgroundBlobUrl(asset.id).catch(() => null);
      const imageUrl = rawUrl || (await getAssetBlobUrl(asset.id));
      if (editObjectUrlRef.current) URL.revokeObjectURL(editObjectUrlRef.current);
      editObjectUrlRef.current = imageUrl;

      // A prior save's crop/text/filter state only applies cleanly when
      // re-opening the *same* untouched raw background it was computed
      // against. Once we fall back to the flattened file (no raw background
      // stored), that file already has the previous edit's text and crop
      // baked into its pixels at whatever dimensions it was exported at - so
      // replaying the old geometry on top would double up text and can push
      // the image out of frame (saved offsets computed for the original
      // source size no longer line up once the file itself has been
      // re-cropped). Start fresh in that case instead: default frame/filters,
      // empty text layers ready for new ones, dims read from the flattened
      // file itself rather than the generic per-type default.
      const savedState = rawUrl ? (asset.metaData?.editorState as EditorState | undefined) : undefined;
      let initialTextLayers: EditableTextLayer[] = [];
      if (savedState?.textLayers) {
        initialTextLayers = savedState.textLayers;
      } else if (rawUrl && asset.metaData?.headline) {
        initialTextLayers = buildDefaultTextLayers(
          asset.metaData.headline,
          asset.metaData.eyebrow,
          asset.metaData.accentColor,
          dims.width,
          dims.height
        );
      }

      setEditingAsset({
        asset,
        imageUrl,
        width: dims.width,
        height: dims.height,
        initialTextLayers,
        initialAspect: savedState?.aspect,
        initialFilters: savedState?.filters,
        initialImageScale: savedState?.imageScale,
        initialImagePos: savedState ? { x: savedState.imageX, y: savedState.imageY } : undefined,
      });
      setSelectedAsset(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to open editor for this asset');
    } finally {
      setEditLoadingId(null);
    }
  };

  const handleSaveLibraryEdit = async (result: { blob: Blob; editorState: EditorState }) => {
    if (!editingAsset) return;
    setIsSavingEdit(true);
    setEditError(null);
    try {
      await saveAssetEdit(editingAsset.asset.id, result.blob, result.editorState);
      setEditingAsset(null);
      await fetchAssets();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save your edits');
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-brand-muted">Asset manager</p>
          <h2 className="font-display text-3xl tracking-tighter text-brand-text mt-1">Generated assets</h2>
          <p className="text-sm text-brand-muted mt-1.5 leading-relaxed">
            Browse, download, and re-edit everything generated across campaigns and brand renders.
          </p>
        </div>
        <span className="text-xs font-medium text-brand-muted bg-brand-surface border border-brand-border px-3 py-1.5 rounded-md shrink-0">
          {assets.length} asset{assets.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="panel p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {TYPE_FILTERS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setFilter(t.value)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                filter === t.value
                  ? 'bg-brand-ink text-brand-ink-text'
                  : 'bg-brand-surface text-brand-muted border border-brand-border hover:text-brand-text hover:border-brand-border-strong'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="w-full md:w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or tag…"
            className="input-field py-1.5 text-xs"
          />
        </div>
      </div>

      {editError && (
        <div role="alert" className="rounded-md bg-state-danger border border-[#F3C6C6] text-state-danger-text text-sm px-4 py-3">
          {editError}
        </div>
      )}

      {isLoading && (
        <div className="py-12 flex justify-center">
          <Spinner label="Loading asset collection…" />
        </div>
      )}

      {!isLoading && assets.length === 0 && (
        <div className="panel p-10 rounded-md border border-dashed border-brand-border-strong flex flex-col items-center justify-center text-center gap-3">
          <div className="w-11 h-11 rounded-md bg-brand-sunken text-brand-muted flex items-center justify-center">
            <ImageIcon className="w-5 h-5" />
          </div>
          <h3 className="text-base font-semibold text-brand-text">No assets yet</h3>
          <p className="text-sm text-brand-muted max-w-sm leading-relaxed">
            Generate a photoshoot render, campaign post, or carousel — everything you save shows up here.
          </p>
        </div>
      )}

      {!isLoading && assets.length > 0 && (
        <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {assets.map((asset) => {
            const typeLabel = TYPE_FILTERS.find((t) => t.value === asset.type)?.label || asset.type;
            const isEditable = EDITABLE_TYPES.has(asset.type);
            return (
              <div
                key={asset.id}
                onClick={() => setSelectedAsset(asset)}
                className="panel p-4 hover:border-brand-border-strong transition-colors cursor-pointer flex flex-col justify-between min-h-[124px] group"
                data-testid="asset-card"
              >
                <div>
                  <AssetThumbnail
                    assetId={asset.id}
                    alt={asset.name}
                    className="w-full aspect-square rounded-md mb-3"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-brand-faint font-mono">{typeLabel}</span>
                    <span className="text-[10px] text-brand-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      View
                    </span>
                  </div>
                  <div className="text-sm font-medium text-brand-text mt-1.5 line-clamp-2">{asset.name}</div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-brand-border">
                  {isEditable ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEdit(asset);
                      }}
                      disabled={editLoadingId === asset.id}
                      className="text-[10px] px-2 py-0.5 rounded font-medium bg-state-success text-state-success-text hover:opacity-80 transition-opacity disabled:opacity-50"
                    >
                      {editLoadingId === asset.id ? 'Opening…' : 'Edit'}
                    </button>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded font-medium bg-brand-sunken text-brand-muted">{asset.type}</span>
                  )}
                  <span className="text-[10px] text-brand-faint">{relativeTime(asset.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/50 backdrop-blur-sm p-4">
          <div className="panel p-6 max-w-md w-full space-y-5 relative">
            <div className="flex items-center justify-between border-b border-brand-border pb-3">
              <h3 className="font-semibold text-brand-text text-base">Asset detail</h3>
              <button
                type="button"
                onClick={() => setSelectedAsset(null)}
                aria-label="Close"
                className="text-brand-faint hover:text-brand-text transition-colors"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>

            <AssetThumbnail
              assetId={selectedAsset.id}
              alt={selectedAsset.name}
              className="w-full max-h-72 rounded-md border border-brand-border"
            />

            <div className="space-y-3 text-sm">
              <div>
                <span className="text-xs text-brand-muted font-medium block uppercase tracking-wide">Name</span>
                <p className="text-brand-text font-medium mt-0.5">{selectedAsset.name}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-xs text-brand-muted font-medium block uppercase tracking-wide">Type</span>
                  <p className="text-brand-primary font-medium mt-0.5">{selectedAsset.type}</p>
                </div>
                <div>
                  <span className="text-xs text-brand-muted font-medium block uppercase tracking-wide">Mime type</span>
                  <p className="text-brand-text font-mono text-xs mt-0.5">{selectedAsset.mimeType}</p>
                </div>
              </div>

              <div>
                <span className="text-xs text-brand-muted font-medium block uppercase tracking-wide">Storage path</span>
                <p className="text-brand-muted font-mono text-xs mt-0.5 truncate bg-brand-sunken p-2 rounded border border-brand-border">
                  {selectedAsset.filePath}
                </p>
              </div>
            </div>

            <div className="pt-2 flex gap-3">
              {EDITABLE_TYPES.has(selectedAsset.type) && (
                <button
                  type="button"
                  onClick={() => handleStartEdit(selectedAsset)}
                  disabled={editLoadingId === selectedAsset.id}
                  className="btn-secondary flex-1 text-xs py-2.5 disabled:opacity-50"
                >
                  {editLoadingId === selectedAsset.id ? 'Opening…' : 'Edit'}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDownloadAsset(selectedAsset.id, selectedAsset.name)}
                className="btn-primary flex-1 text-xs py-2.5"
              >
                Download file
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

      {editingAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="panel p-6 max-w-3xl w-full space-y-4 relative my-8">
            <div className="flex items-center justify-between border-b border-brand-border pb-3">
              <div>
                <h3 className="font-semibold text-brand-text text-base">Edit asset</h3>
                <p className="text-xs text-brand-muted mt-0.5 line-clamp-1">{editingAsset.asset.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAsset(null)}
                aria-label="Close"
                className="text-brand-faint hover:text-brand-text transition-colors"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
            <AssetEditor
              imageUrl={editingAsset.imageUrl}
              nativeWidth={editingAsset.width}
              nativeHeight={editingAsset.height}
              initialTextLayers={editingAsset.initialTextLayers}
              initialAspect={editingAsset.initialAspect}
              initialFilters={editingAsset.initialFilters}
              initialImageScale={editingAsset.initialImageScale}
              initialImagePos={editingAsset.initialImagePos}
              onSave={handleSaveLibraryEdit}
              onCancel={() => setEditingAsset(null)}
              isSaving={isSavingEdit}
              saveLabel="Save changes"
            />
          </div>
        </div>
      )}
    </div>
  );
};
