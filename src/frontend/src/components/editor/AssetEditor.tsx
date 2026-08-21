import React, { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Text as KonvaText, Transformer, Rect } from 'react-konva';
import Konva from 'konva';
import { CheckIcon, CloseIcon } from '../icons';

/**
 * Loads an <img> for the given URL. Deliberately not the `use-image` library:
 * under React.StrictMode's double-invoke-effects dev behavior, its internal
 * Image load can be aborted by the first (synthetic) unmount in a way that
 * leaves the second, "real" mount's request against the same blob: URL stuck
 * in "loading" forever - reproduced consistently when re-opening the editor
 * from the Asset Library. This effect never touches `img.src` on cleanup, so
 * the discarded StrictMode pass's load just completes ignored instead of
 * interfering with the one that matters.
 */
function useEditorImage(url: string): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!cancelled) setImage(img);
    };
    img.onerror = () => {
      if (!cancelled) setImage(null);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return image;
}

export interface EditableTextLayer {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontWeight: number;
  fontFamily?: string;
  letterSpacing?: number;
  eyebrow?: boolean;
}

export type AspectPresetKey = 'original' | 'square' | 'portrait' | 'story';

interface AspectPreset {
  key: AspectPresetKey;
  label: string;
  /** width / height, or null to keep the source image's native ratio. */
  ratio: number | null;
}

export const ASPECT_PRESETS: AspectPreset[] = [
  { key: 'original', label: 'Original', ratio: null },
  { key: 'square', label: 'Square · 1:1', ratio: 1 },
  { key: 'portrait', label: 'Portrait · 4:5', ratio: 4 / 5 },
  { key: 'story', label: 'Story · 9:16', ratio: 9 / 16 },
];

interface Frame {
  width: number;
  height: number;
}

/** The crop/export frame for a given aspect preset, sized off the source image's longer edge. */
function computeFrame(preset: AspectPreset, sourceWidth: number, sourceHeight: number): Frame {
  if (preset.ratio === null) {
    return { width: sourceWidth, height: sourceHeight };
  }
  const refSize = Math.max(sourceWidth, sourceHeight);
  const width = preset.ratio <= 1 ? refSize * preset.ratio : refSize;
  const height = preset.ratio <= 1 ? refSize : refSize / preset.ratio;
  return { width: Math.round(width), height: Math.round(height) };
}

/** Minimum scale at which the source image fully covers the frame (no transparent gaps), and a centered position at that scale. */
function coverFit(frame: Frame, sourceWidth: number, sourceHeight: number): { scale: number; pos: { x: number; y: number } } {
  const scale = Math.max(frame.width / sourceWidth, frame.height / sourceHeight);
  const pos = {
    x: (frame.width - sourceWidth * scale) / 2,
    y: (frame.height - sourceHeight * scale) / 2,
  };
  return { scale, pos };
}

export interface EditorState {
  textLayers: EditableTextLayer[];
  filters: { brightness: number; contrast: number; saturation: number };
  imageX: number;
  imageY: number;
  imageScale: number;
  aspect: AspectPresetKey;
}

interface AssetEditorProps {
  imageUrl: string;
  nativeWidth: number;
  nativeHeight: number;
  initialTextLayers: EditableTextLayer[];
  onSave: (result: { blob: Blob; editorState: EditorState }) => Promise<void> | void;
  onCancel?: () => void;
  isSaving?: boolean;
  saveLabel?: string;
  /** Restores a previously-saved edit (re-opening from the Asset Library) instead of starting fresh. */
  initialAspect?: AspectPresetKey;
  initialFilters?: { brightness: number; contrast: number; saturation: number };
  initialImageScale?: number;
  initialImagePos?: { x: number; y: number };
}

const DISPLAY_WIDTH = 380;
const TEXT_COLORS = ['#FFFFFF', '#17160F', '#F4B942'];
const DEFAULT_FONT_FAMILY = 'Helvetica, Arial, sans-serif';
// Reuses the three families already loaded for the app's own UI chrome
// (index.html's Google Fonts link) - no new font loading/network request
// needed for the editor to offer real style variety. Server-side
// compositing (composite.service.ts) only ever bakes the initial flattened
// asset before the editor is opened; a save here re-exports via
// stage.toDataURL(), which already captures whatever font Konva actually
// rendered, so this is editor-only, no backend change needed.
const FONT_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'Sans', value: DEFAULT_FONT_FAMILY },
  { label: 'Outfit', value: '"Outfit", Helvetica, Arial, sans-serif' },
  { label: 'Serif', value: '"Instrument Serif", Georgia, serif' },
  { label: 'Mono', value: '"JetBrains Mono", ui-monospace, monospace' },
];
// Small, honest set of natural-language color names for the quick-edit bar -
// this is a keyword matcher, not an LLM, so it only understands names it's
// explicitly told about (see handleQuickEdit).
const NAMED_COLORS: Record<string, string> = {
  white: '#FFFFFF',
  black: '#17160F',
  gold: '#F4B942',
  yellow: '#F4B942',
  red: '#C1462F',
  orange: '#E07A3E',
  green: '#1F3B33',
  blue: '#1F3B7A',
  cream: '#FBFAF7',
};
const FILTER_PRESETS: Array<{ label: string; brightness: number; contrast: number; saturation: number }> = [
  { label: 'None', brightness: 0, contrast: 0, saturation: 0 },
  { label: 'Warm', brightness: 0.03, contrast: 8, saturation: 0.15 },
  { label: 'Cool', brightness: 0.0, contrast: 5, saturation: -0.1 },
  { label: 'Vivid', brightness: 0.02, contrast: 18, saturation: 0.3 },
  { label: 'Mono', brightness: 0, contrast: 10, saturation: -1 },
];

function matchFilterPreset(filters?: { brightness: number; contrast: number; saturation: number }) {
  if (!filters) return FILTER_PRESETS[0];
  const match = FILTER_PRESETS.find(
    (p) => p.brightness === filters.brightness && p.contrast === filters.contrast && p.saturation === filters.saturation
  );
  return match || { label: 'Custom', ...filters };
}

let layerIdCounter = 0;
function nextLayerId(): string {
  layerIdCounter += 1;
  return `layer-${Date.now()}-${layerIdCounter}`;
}

/**
 * Builds a starting headline (+ optional eyebrow) text layer, positioned to
 * roughly match where the backend's server-side compositor would have placed
 * it - so opening the editor right after generation doesn't jump the text
 * to a visibly different spot than what informed the copy/QA pass.
 */
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function buildDefaultTextLayers(
  headline: string,
  eyebrow: string | undefined,
  accentColor: string | undefined,
  width: number,
  height: number
): EditableTextLayer[] {
  const fontSize = Math.max(28, Math.round(width * 0.052));
  const layers: EditableTextLayer[] = [];

  if (eyebrow) {
    layers.push({
      id: nextLayerId(),
      text: eyebrow,
      x: 48,
      y: height - 48 - fontSize * 1.6,
      fontSize: Math.round(fontSize * 0.42),
      // Matches the server-side compositor (composite.service.ts) - the
      // eyebrow carries the brand's accent color, the headline stays white.
      // Was previously hardcoded white here too, silently dropping
      // accentColor despite the caller always passing it.
      color: accentColor && HEX_COLOR_PATTERN.test(accentColor) ? accentColor : '#FFFFFF',
      fontWeight: 700,
      letterSpacing: 1.5,
      eyebrow: true,
    });
  }

  layers.push({
    id: nextLayerId(),
    text: headline,
    x: 48,
    y: height - 48 - fontSize * 1.15,
    fontSize,
    color: '#FFFFFF',
    fontWeight: 700,
  });

  return layers;
}

export const AssetEditor: React.FC<AssetEditorProps> = ({
  imageUrl,
  nativeWidth,
  nativeHeight,
  initialTextLayers,
  onSave,
  onCancel,
  isSaving,
  saveLabel = 'Save',
  initialAspect = 'original',
  initialFilters,
  initialImageScale,
  initialImagePos,
}) => {
  const image = useEditorImage(imageUrl);

  const [aspect, setAspect] = useState<AspectPresetKey>(initialAspect);
  const activePreset = ASPECT_PRESETS.find((p) => p.key === aspect) || ASPECT_PRESETS[0];

  // The caller's nativeWidth/nativeHeight are a best guess (the per-type
  // generation size) - accurate for a raw background, but a flattened
  // fallback file (see AssetsLibraryView) may already be a previous export
  // at different dimensions. Once the image actually loads, reconcile
  // against its real pixel size so cover-fit/frame math doesn't drift.
  const [sourceSize, setSourceSize] = useState({ width: nativeWidth, height: nativeHeight });
  const reconciledImageRef = useRef<HTMLImageElement | null>(null);

  const [frame, setFrame] = useState<Frame>(() => computeFrame(activePreset, sourceSize.width, sourceSize.height));

  const displayHeight = Math.round((frame.height / frame.width) * DISPLAY_WIDTH);
  const pixelRatio = frame.width / DISPLAY_WIDTH;

  const [textLayers, setTextLayers] = useState<EditableTextLayer[]>(initialTextLayers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState(matchFilterPreset(initialFilters));
  const [quickEditInput, setQuickEditInput] = useState('');
  const [quickEditFeedback, setQuickEditFeedback] = useState<string | null>(null);
  const initialFit = coverFit(frame, sourceSize.width, sourceSize.height);
  const [imageScale, setImageScale] = useState(initialImageScale ?? initialFit.scale);
  const [imagePos, setImagePos] = useState(initialImagePos ?? initialFit.pos);

  const stageRef = useRef<Konva.Stage>(null);
  const imageNodeRef = useRef<Konva.Image>(null);
  const textNodeRefs = useRef<Record<string, Konva.Text>>({});
  const transformerRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (!image || reconciledImageRef.current === image) return;
    reconciledImageRef.current = image;
    const actualWidth = image.naturalWidth || sourceSize.width;
    const actualHeight = image.naturalHeight || sourceSize.height;
    if (actualWidth === sourceSize.width && actualHeight === sourceSize.height) return;
    setSourceSize({ width: actualWidth, height: actualHeight });
    const nextFrame = computeFrame(activePreset, actualWidth, actualHeight);
    const fit = coverFit(nextFrame, actualWidth, actualHeight);
    setFrame(nextFrame);
    setImageScale(fit.scale);
    setImagePos(fit.pos);
    // Only meant to run once, right after the image first resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  // Konva requires an explicit cache() before filters apply, and re-cache whenever
  // the underlying image/filter values change.
  useEffect(() => {
    const node = imageNodeRef.current;
    if (!node || !image) return;
    node.cache();
    node.filters([Konva.Filters.Brighten, Konva.Filters.Contrast, Konva.Filters.HSL]);
    node.brightness(filters.brightness);
    node.contrast(filters.contrast);
    node.saturation(filters.saturation);
    node.getLayer()?.batchDraw();
  }, [image, filters]);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const node = selectedId ? textNodeRefs.current[selectedId] : null;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, textLayers]);

  const updateLayer = (id: string, patch: Partial<EditableTextLayer>) => {
    setTextLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const handleAddText = (text: string = 'New text') => {
    const id = nextLayerId();
    const newLayer: EditableTextLayer = {
      id,
      text,
      x: frame.width * 0.1,
      y: frame.height / 2,
      fontSize: Math.round(frame.width * 0.045),
      color: '#FFFFFF',
      fontWeight: 700,
      fontFamily: DEFAULT_FONT_FAMILY,
    };
    setTextLayers((prev) => [...prev, newLayer]);
    setSelectedId(id);
  };

  const handleDeleteSelected = () => {
    if (!selectedId) return;
    setTextLayers((prev) => prev.filter((l) => l.id !== selectedId));
    setSelectedId(null);
  };

  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (e.target === e.target.getStage()) setSelectedId(null);
  };

  /**
   * Switching format (Square/Portrait/Story/Original) changes the export
   * frame's dimensions. Text layers are rescaled proportionally so their
   * relative position/size on the frame is preserved, and the image is
   * re-centered at the minimum scale that still fully covers the new frame
   * (avoiding transparent letterboxing) rather than carrying over a scale
   * that may no longer cover it.
   */
  const handleAspectChange = (preset: AspectPreset) => {
    if (preset.key === aspect) return;
    const nextFrame = computeFrame(preset, sourceSize.width, sourceSize.height);
    const scaleX = nextFrame.width / frame.width;
    const scaleY = nextFrame.height / frame.height;

    setTextLayers((prev) =>
      prev.map((l) => ({
        ...l,
        x: l.x * scaleX,
        y: l.y * scaleY,
        fontSize: Math.max(10, Math.round(l.fontSize * ((scaleX + scaleY) / 2))),
      }))
    );

    const fit = coverFit(nextFrame, sourceSize.width, sourceSize.height);
    setImageScale(fit.scale);
    setImagePos(fit.pos);
    setFrame(nextFrame);
    setAspect(preset.key);
    setSelectedId(null);
  };

  /**
   * Small keyword-based command bar, not an LLM call - deliberately scoped
   * and honest about that in the UI copy. Understands: bigger/smaller (font
   * size), a handful of named colors or a #hex code, the five filter presets
   * by name, and the four aspect presets by name. Targets the selected text
   * layer when one is selected; otherwise every text layer, unless the
   * command explicitly says "background"/"image"/"photo", which always
   * means the filter/image controls regardless of selection.
   */
  const handleQuickEdit = () => {
    const command = quickEditInput.trim().toLowerCase();
    if (!command) return;

    const mentionsBackground = /\b(background|image|photo|picture)\b/.test(command);
    const targetLayers = selectedId ? textLayers.filter((l) => l.id === selectedId) : textLayers;
    let applied = false;

    if (!mentionsBackground && /\b(bigger|larger|increase size)\b/.test(command) && targetLayers.length > 0) {
      const ids = new Set(targetLayers.map((l) => l.id));
      setTextLayers((prev) => prev.map((l) => (ids.has(l.id) ? { ...l, fontSize: Math.round(l.fontSize * 1.2) } : l)));
      applied = true;
    } else if (!mentionsBackground && /\b(smaller|decrease size|shrink)\b/.test(command) && targetLayers.length > 0) {
      const ids = new Set(targetLayers.map((l) => l.id));
      setTextLayers((prev) => prev.map((l) => (ids.has(l.id) ? { ...l, fontSize: Math.max(10, Math.round(l.fontSize * 0.8)) } : l)));
      applied = true;
    }

    if (!applied) {
      const hexMatch = command.match(/#[0-9a-f]{6}\b/);
      const namedColor = Object.keys(NAMED_COLORS).find((name) => new RegExp(`\\b${name}\\b`).test(command));
      const color = hexMatch ? hexMatch[0] : namedColor ? NAMED_COLORS[namedColor] : null;
      if (color && !mentionsBackground && targetLayers.length > 0) {
        const ids = new Set(targetLayers.map((l) => l.id));
        setTextLayers((prev) => prev.map((l) => (ids.has(l.id) ? { ...l, color } : l)));
        applied = true;
      }
    }

    if (!applied) {
      const filterMatch = FILTER_PRESETS.find((p) => new RegExp(`\\b${p.label.toLowerCase()}\\b`).test(command));
      if (filterMatch && (mentionsBackground || !/\btext|headline|title\b/.test(command))) {
        setFilters(filterMatch);
        applied = true;
      }
    }

    if (!applied) {
      const aspectMatch = ASPECT_PRESETS.find((p) => command.includes(p.key) || command.includes(p.label.split(' ')[0].toLowerCase()));
      if (aspectMatch && /\b(format|crop|aspect|ratio)\b/.test(command)) {
        handleAspectChange(aspectMatch);
        applied = true;
      }
    }

    // Nothing else matched, and this reads like actual content someone
    // wants on the image (a real phrase, not a one/two-word attempt at a
    // keyword shortcut) - previously the box only accepted the listed
    // shortcuts, so typing an actual headline/punchline (a very natural
    // thing to try, despite the "keyword shortcuts, not AI" hint) just
    // failed with no path forward. Sets it as the selected layer's text,
    // or adds a new layer with it if none is selected - still not an LLM
    // call, just literally using the typed words as the text content.
    if (!applied && !mentionsBackground && quickEditInput.trim().split(/\s+/).length >= 2) {
      const content = quickEditInput.trim();
      if (selectedId) {
        setTextLayers((prev) => prev.map((l) => (l.id === selectedId ? { ...l, text: content } : l)));
      } else {
        handleAddText(content);
      }
      applied = true;
    }

    setQuickEditFeedback(
      applied
        ? null
        : "Couldn't match that to an edit — try \"bigger\", \"smaller\", a color name, a filter (warm/cool/vivid/mono), or a format (square/portrait/story)."
    );
    if (applied) setQuickEditInput('');
  };

  const handleSave = async () => {
    const stage = stageRef.current;
    if (!stage) return;
    setSelectedId(null);
    // Let the deselect (Transformer detach) commit before rasterizing.
    await new Promise((resolve) => setTimeout(resolve, 30));
    const dataUrl = stage.toDataURL({ mimeType: 'image/jpeg', quality: 0.92, pixelRatio });
    const blob = await (await fetch(dataUrl)).blob();
    const editorState: EditorState = {
      textLayers,
      filters: { brightness: filters.brightness, contrast: filters.contrast, saturation: filters.saturation },
      imageX: imagePos.x,
      imageY: imagePos.y,
      imageScale,
      aspect,
    };
    await onSave({ blob, editorState });
  };

  const selectedLayer = textLayers.find((l) => l.id === selectedId) || null;
  const coverScale = coverFit(frame, sourceSize.width, sourceSize.height).scale;
  const zoomMin = +coverScale.toFixed(2);
  const zoomMax = +(coverScale * 2.4).toFixed(2);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[auto,1fr] gap-5">
      <div>
        <div
          className="rounded-md overflow-hidden border border-brand-border bg-brand-sunken"
          style={{ width: DISPLAY_WIDTH, height: displayHeight }}
        >
          {/*
            Rendered at the small on-screen size (DISPLAY_WIDTH), with children
            positioned in native/frame pixel coordinates and shrunk to fit via
            scaleX/scaleY - Konva's Stage sizes its container div in CSS pixels
            equal to width/height, so setting those to the *native* resolution
            (as this used to) just overflowed this wrapper's fixed CSS size and
            got clipped by overflow-hidden instead of visually scaling down.
            Export still rasterizes at full native resolution via
            toDataURL({ pixelRatio }) below, independent of this on-screen scale.
          */}
          <Stage
            ref={stageRef}
            width={DISPLAY_WIDTH}
            height={displayHeight}
            scaleX={DISPLAY_WIDTH / frame.width}
            scaleY={displayHeight / frame.height}
            onMouseDown={handleStageMouseDown}
            onTouchStart={handleStageMouseDown}
          >
            <Layer>
              {image && (
                <KonvaImage
                  ref={imageNodeRef}
                  image={image}
                  x={imagePos.x}
                  y={imagePos.y}
                  width={sourceSize.width * imageScale}
                  height={sourceSize.height * imageScale}
                  draggable
                  onDragEnd={(e) => setImagePos({ x: e.target.x(), y: e.target.y() })}
                />
              )}
              <Rect
                x={0}
                y={frame.height * 0.55}
                width={frame.width}
                height={frame.height * 0.45}
                listening={false}
                fillLinearGradientStartPoint={{ x: 0, y: 0 }}
                fillLinearGradientEndPoint={{ x: 0, y: frame.height * 0.45 }}
                fillLinearGradientColorStops={[0, 'rgba(0,0,0,0)', 1, 'rgba(0,0,0,0.72)']}
              />
              {textLayers.map((layer) => (
                <KonvaText
                  key={layer.id}
                  ref={(node) => {
                    if (node) textNodeRefs.current[layer.id] = node;
                  }}
                  text={layer.eyebrow ? layer.text.toUpperCase() : layer.text}
                  x={layer.x}
                  y={layer.y}
                  fontSize={layer.fontSize}
                  fontStyle={String(layer.fontWeight)}
                  fontFamily={layer.fontFamily || DEFAULT_FONT_FAMILY}
                  fill={layer.color}
                  letterSpacing={layer.letterSpacing || 0}
                  draggable
                  width={frame.width * 0.86}
                  onClick={() => setSelectedId(layer.id)}
                  onTap={() => setSelectedId(layer.id)}
                  onDragEnd={(e) => updateLayer(layer.id, { x: e.target.x(), y: e.target.y() })}
                  onTransformEnd={(e) => {
                    const node = e.target as Konva.Text;
                    const scale = node.scaleX();
                    node.scaleX(1);
                    node.scaleY(1);
                    updateLayer(layer.id, {
                      fontSize: Math.max(10, Math.round(layer.fontSize * scale)),
                      x: node.x(),
                      y: node.y(),
                    });
                  }}
                />
              ))}
              <Transformer
                ref={transformerRef}
                rotateEnabled={false}
                enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
              />
            </Layer>
          </Stage>
        </div>
        <div className="mt-3">
          <label className="text-[11px] font-medium text-brand-muted block mb-1">Format / crop</label>
          <div className="flex flex-wrap gap-1.5">
            {ASPECT_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => handleAspectChange(preset)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                  aspect === preset.key
                    ? 'bg-brand-ink text-brand-ink-text border-brand-ink'
                    : 'bg-brand-surface text-brand-muted border-brand-border hover:border-brand-border-strong'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <label className="text-[11px] font-medium text-brand-muted block mb-1">Zoom / reposition</label>
          <input
            type="range"
            min={zoomMin}
            max={zoomMax}
            step={0.02}
            value={Math.min(Math.max(imageScale, zoomMin), zoomMax)}
            onChange={(e) => setImageScale(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>
      </div>

      <div className="space-y-5 min-w-0">
        <div>
          <p className="text-xs font-semibold text-brand-text mb-1.5">Quick edit</p>
          <p className="text-[11px] text-brand-muted mb-2">
            Keyword shortcuts, not AI — try "make it bigger", a color name, "warm"/"cool"/"vivid"/"mono", "square"/"portrait"/"story" format, or just type a headline to set it as text.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={quickEditInput}
              onChange={(e) => {
                setQuickEditInput(e.target.value);
                if (quickEditFeedback) setQuickEditFeedback(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleQuickEdit();
                }
              }}
              placeholder="e.g. make the headline bigger"
              className="input-field text-sm flex-1"
            />
            <button type="button" onClick={handleQuickEdit} className="btn-secondary px-3 py-2 text-xs shrink-0">
              Apply
            </button>
          </div>
          {quickEditFeedback && <p className="text-[11px] text-state-danger-text mt-1.5">{quickEditFeedback}</p>}
        </div>

        <div>
          <p className="text-xs font-semibold text-brand-text mb-2">Filters</p>
          <div className="flex flex-wrap gap-2">
            {FILTER_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setFilters(preset)}
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                  filters.label === preset.label
                    ? 'bg-brand-ink text-brand-ink-text border-brand-ink'
                    : 'bg-brand-surface text-brand-muted border-brand-border hover:border-brand-border-strong'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-brand-text">Text layers</p>
          <button type="button" onClick={() => handleAddText()} className="text-xs font-medium text-brand-primary hover:underline">
            + Add text
          </button>
        </div>

        {selectedLayer ? (
          <div className="rounded-md border border-brand-border bg-brand-sunken p-3.5 space-y-3">
            <div>
              <label className="text-[11px] font-medium text-brand-muted block mb-1">Text</label>
              <textarea
                value={selectedLayer.text}
                onChange={(e) => updateLayer(selectedLayer.id, { text: e.target.value })}
                rows={2}
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-brand-muted block mb-1">
                Size &middot; {selectedLayer.fontSize}px
              </label>
              <input
                type="range"
                min={16}
                max={Math.round(frame.width * 0.14)}
                value={selectedLayer.fontSize}
                onChange={(e) => updateLayer(selectedLayer.id, { fontSize: parseInt(e.target.value, 10) })}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-brand-muted block mb-1">Font</label>
              <div className="flex gap-1.5 flex-wrap">
                {FONT_OPTIONS.map((font) => {
                  const isActive = (selectedLayer.fontFamily || DEFAULT_FONT_FAMILY) === font.value;
                  return (
                    <button
                      key={font.value}
                      type="button"
                      onClick={() => updateLayer(selectedLayer.id, { fontFamily: font.value })}
                      style={{ fontFamily: font.value }}
                      className={`px-2.5 py-1.5 rounded-md border text-xs ${
                        isActive
                          ? 'bg-brand-ink text-brand-ink-text border-brand-ink'
                          : 'border-brand-border text-brand-text hover:border-brand-border-strong'
                      }`}
                    >
                      {font.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                {TEXT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => updateLayer(selectedLayer.id, { color })}
                    aria-label={`Set text color ${color}`}
                    className={`w-6 h-6 rounded-full border-2 ${selectedLayer.color === color ? 'border-brand-primary' : 'border-brand-border'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="text-xs font-medium text-state-danger-text hover:underline"
              >
                Delete layer
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-brand-muted">Click any text on the canvas to edit it, or add a new layer.</p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button type="button" onClick={handleSave} disabled={isSaving} className="btn-primary px-5 py-2 text-sm inline-flex items-center gap-2">
            <CheckIcon className="w-4 h-4" />
            {isSaving ? 'Saving…' : saveLabel}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="btn-secondary px-4 py-2 text-sm inline-flex items-center gap-2">
              <CloseIcon className="w-4 h-4" />
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
