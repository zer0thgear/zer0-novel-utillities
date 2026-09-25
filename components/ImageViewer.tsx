'use client';

import { useEffect, useState } from 'react';
import { downloadImage, getImageDimensions } from '@/lib/imageUtils';
import { useSessionStore } from '@/store/sessionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useEnhance } from '@/hooks/useEnhance';
import {
  ENHANCE_LEVELS,
  EnhanceLevelNum,
  EnhanceScale,
  enhanceOutputSize,
  enhancePriceSize,
  enhanceScales,
  scaleLabel,
} from '@/lib/enhance';
import { useVariations, VARIATION_COUNT, VARIATION_STRENGTH } from '@/hooks/useVariations';
import { useChainLauncher } from '@/hooks/useChainLauncher';
import { useChainBusy } from '@/store/chainStore';
import { chainSummary } from '@/lib/chains';
import { useUpscale } from '@/hooks/useUpscale';
import { useSubscription } from '@/hooks/useSubscription';
import {
  calculateAnlasCost,
  MAX_GENERATION_PIXELS,
  opusStatus,
  UPSCALE_MAX_PIXELS,
  upscaleCost,
} from '@/lib/anlasCost';
import { CanvasEditor } from './CanvasEditor';
import { eraseStealthMarks } from '@/lib/requestImage';
import { applyEditorResult, baseFromImage, EditorMode } from '@/lib/editorResult';
import { DirectorToolsModal } from './DirectorToolsModal';
import { MetadataModal } from './MetadataModal';
import { DEFAULT_IMPORT, ImportModal } from './ImportModal';
import { metadataFromImage } from '@/lib/naiMetadata';
import { BatchGrid } from './BatchGrid';
import { GeneratedImage } from '@/types/novelai';

// ─── Spinner SVG ──────────────────────────────────────────────────────────────

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

// The last Enhance scale picked for images of each size, as NovelAI keeps it.
const SCALE_MEMORY_KEY = 'enhance-scale-by-size';

function rememberedScale(pixels: number, options: EnhanceScale[]): EnhanceScale | null {
  try {
    const saved = (JSON.parse(localStorage.getItem(SCALE_MEMORY_KEY) ?? '{}') as Record<string, EnhanceScale>)[pixels];
    return saved !== undefined && options.includes(saved) ? saved : null;
  } catch {
    return null;
  }
}

function rememberScale(pixels: number, scale: EnhanceScale) {
  try {
    const saved = JSON.parse(localStorage.getItem(SCALE_MEMORY_KEY) ?? '{}') as Record<string, EnhanceScale>;
    localStorage.setItem(SCALE_MEMORY_KEY, JSON.stringify({ ...saved, [pixels]: scale }));
  } catch {
    // Storage unavailable: the pick still applies until the image changes.
  }
}

/** What a group is: "Batch of 4", a sweep's axes, or a chain's name. */
function groupTitle(group: GeneratedImage[]): string {
  const sweep = group.find((img) => img.sweep)?.sweep;
  const chain = group[0]?.chain;
  if (chain) return `Chain · ${chain.name}`;
  if (sweep) return `Sweep · ${sweep.x.name}${sweep.y ? ` × ${sweep.y.name}` : ''}`;
  return `Batch of ${group.length}`;
}

export function ImageViewer() {
  const { images, focusedImageId, isLoading, streamPreview, setImg2imgSource } = useSessionStore();
  const focusedGroupId = useSessionStore((s) => s.focusedGroupId);
  const backToGroup = useSessionStore((s) => s.backToGroup);
  const setFocusedImageId = useSessionStore((s) => s.setFocusedImageId);
  const setSeed = useSettingsStore((s) => s.set);
  const form = useSettingsStore();
  const { subscription } = useSubscription();
  const opus = opusStatus(subscription);

  const focusedImage = images.find((img) => img.id === focusedImageId) ?? null;
  // A group shown as a grid (no image open), or the group an open image came from.
  const groupImages = focusedGroupId
    ? images.filter((img) => img.batchId === focusedGroupId).sort((a, b) => a.timestamp - b.timestamp)
    : [];
  const inGroup = !!focusedImage && groupImages.some((img) => img.id === focusedImage.id);

  const [showEnhance, setShowEnhance] = useState(false);
  const [enhanceLevel, setEnhanceLevel] = useState<EnhanceLevelNum>(3);
  // Null until picked, then NovelAI's default applies (see enhanceScale below).
  const [enhanceScaleChoice, setEnhanceScaleChoice] = useState<EnhanceScale | null>(null);
  const [seedCopied, setSeedCopied] = useState(false);
  // True while the "view original" button is held down
  const [viewingOriginal, setViewingOriginal] = useState(false);
  // The Edit / Inpaint canvas, open on a history image. Saving makes it the
  // Image2Image base and comes back here, as novelai.net does: generating is
  // done from the main screen, with the prompt and settings to hand.
  const [canvas, setCanvas] = useState<{ mode: EditorMode; picture: Blob; image: GeneratedImage } | null>(null);
  const [showDirectorTools, setShowDirectorTools] = useState(false);
  const [baseImageSet, setBaseImageSet] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [showReuse, setShowReuse] = useState(false);
  const [showChains, setShowChains] = useState(false);
  const chains = useSettingsStore((s) => s.chains);
  const launchChain = useChainLauncher();
  // While a chain runs, other image actions wait so requests never overlap.
  const chainBusy = useChainBusy();

  // ← and → step through the session's images, newest to oldest, as long as
  // nothing else wants the key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (document.querySelector('.fixed.inset-0')) return;
      // With a grid open and no image picked, the arrows mean nothing yet.
      if (!focusedImageId) return;
      const at = images.findIndex((img) => img.id === focusedImageId);
      if (at < 0) return;
      // The strip runs newest first, so → goes back in time.
      const next = images[at + (e.key === 'ArrowRight' ? 1 : -1)];
      if (!next) return;
      e.preventDefault();
      setFocusedImageId(next.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images, focusedImageId, setFocusedImageId]);

  // Escape goes from one of a group's images back to its grid, as NovelAI's
  // canvas does, unless a field or an open dialog has the key.
  useEffect(() => {
    if (!inGroup) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (document.querySelector('.fixed.inset-0')) return;
      backToGroup();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inGroup, backToGroup]);

  const { enhance, isEnhancing, error: enhanceError, clearError: clearEnhanceError } = useEnhance();
  const { generateVariations, isGeneratingVariations, error: variationsError, clearError: clearVariationsError } = useVariations();
  const { upscale, isUpscaling, error: upscaleError, clearError: clearUpscaleError } = useUpscale();

  const imgW = focusedImage?.parameters.width ?? 0;
  const imgH = focusedImage?.parameters.height ?? 0;

  // Enhance offers NovelAI's scales for this size. Like NovelAI, the last
  // pick for an image of this size is remembered, else the largest applies.
  const enhanceOptions = focusedImage ? enhanceScales(imgW, imgH, form.model) : [];
  const enhanceScale: EnhanceScale | null =
    enhanceScaleChoice !== null && enhanceOptions.includes(enhanceScaleChoice)
      ? enhanceScaleChoice
      : (rememberedScale(imgW * imgH, enhanceOptions) ?? enhanceOptions[0] ?? null);
  const pickEnhanceScale = (scale: EnhanceScale) => {
    setEnhanceScaleChoice(scale);
    rememberScale(imgW * imgH, scale);
  };
  const enhancePrice = enhanceScale !== null ? enhancePriceSize(imgW, imgH, enhanceScale) : null;
  const enhanceCost = enhancePrice
    ? calculateAnlasCost({
        model: form.model,
        width: enhancePrice.width,
        height: enhancePrice.height,
        steps: form.steps,
        smea: false,
        smeaDyn: false,
        strength: ENHANCE_LEVELS[enhanceLevel - 1].strength,
        ...opus,
      })
    : 0;
  const variationsCost = focusedImage
    ? calculateAnlasCost({
        model: focusedImage.model,
        width: focusedImage.parameters.width,
        height: focusedImage.parameters.height,
        steps: focusedImage.parameters.steps,
        smea: false,
        smeaDyn: false,
        nSamples: VARIATION_COUNT,
        strength: VARIATION_STRENGTH,
        ...opus,
      })
    : 0;
  const upscalePrice = focusedImage ? upscaleCost(focusedImage.parameters.width, focusedImage.parameters.height) : null;

  // NovelAI refuses renders past ~3.1 MP (Variations, Inpaint and Edit render
  // at the image's size) and only upscales images up to 1 MP. Explain instead
  // of letting the request fail. Enhance's limits are in its scale options.
  const tooLargeHint = (w: number, h: number) =>
    `NovelAI can't render ${w}×${h}; its limit is about 3.1 megapixels.`;
  const renderTooLarge = imgW * imgH > MAX_GENERATION_PIXELS ? tooLargeHint(imgW, imgH) : null;
  const cantEnhance =
    focusedImage && enhanceOptions.length === 0
      ? `NovelAI can't enhance a ${imgW}×${imgH} image: no scale stays within 3.1 megapixels on multiples of 64.`
      : null;
  const upscaleTooLarge =
    imgW * imgH > UPSCALE_MAX_PIXELS ? `Upscale only takes images up to 1 megapixel; this one is ${imgW}×${imgH}.` : null;

  // Reset transient state whenever the focused image changes. Done during
  // render (React's pattern for state derived from a prop change) rather than
  // in an effect, so the new image never renders with the old image's panels.
  const [stateFor, setStateFor] = useState(focusedImageId);
  if (stateFor !== focusedImageId) {
    setStateFor(focusedImageId);
    setViewingOriginal(false);
    setShowEnhance(false);
    setCanvas(null);
    setShowDirectorTools(false);
    setBaseImageSet(false);
    setShowMetadata(false);
    setShowChains(false);
    setEnhanceScaleChoice(null);
  }

  const handleEnhance = async () => {
    if (!focusedImage) return;
    setShowEnhance(false);
    if (enhanceScale === null) return;
    await enhance(focusedImage, enhanceLevel, enhanceScale);
  };

  /** Opens the canvas on this image, stealth metadata erased first, as
   *  NovelAI's canvas does when it loads one. */
  const openCanvas = async (mode: EditorMode) => {
    if (!focusedImage) return;
    setCanvas({ mode, picture: await eraseStealthMarks(focusedImage.blob), image: focusedImage });
  };

  const handleUseAsBase = async () => {
    if (!focusedImage) return;
    const { width, height } = await getImageDimensions(focusedImage.blob);
    // A fresh object URL — the store revokes this one on removal, and must not
    // share the URL already displaying focusedImage in the gallery/history.
    const url = URL.createObjectURL(focusedImage.blob);
    setImg2imgSource({ blob: focusedImage.blob, url, width, height });
    setBaseImageSet(true);
    setTimeout(() => setBaseImageSet(false), 1200);
  };

  // The URL to display — switches to source while "view original" is held
  const displayUrl =
    viewingOriginal && focusedImage?.sourceImageUrl
      ? focusedImage.sourceImageUrl
      : focusedImage?.url;

  return (
    <div className="flex h-full flex-col bg-slate-950">
      {canvas && (
        <CanvasEditor
          mode={canvas.mode}
          image={canvas.picture}
          width={canvas.image.parameters.width}
          height={canvas.image.parameters.height}
          onSave={(result) => {
            setImg2imgSource(applyEditorResult(baseFromImage(canvas.image, canvas.picture), canvas.mode, result));
            setCanvas(null);
            setBaseImageSet(true);
            setTimeout(() => setBaseImageSet(false), 1200);
          }}
          onCancel={() => setCanvas(null)}
        />
      )}
      {showDirectorTools && focusedImage && (
        <DirectorToolsModal image={focusedImage} onClose={() => setShowDirectorTools(false)} />
      )}
      {showReuse && focusedImage && (
        <ImportModal
          key={focusedImage.id}
          title="Reuse this image"
          importHeading="Load back into the sidebar:"
          previewUrl={focusedImage.url}
          metadata={metadataFromImage(focusedImage)}
          // Your own image: bringing its settings back is the usual intent.
          defaults={{ ...DEFAULT_IMPORT, settings: true }}
          onViewMetadata={() => setShowMetadata(true)}
          escapeDisabled={showMetadata}
          onClose={() => setShowReuse(false)}
        />
      )}
      {showMetadata && focusedImage && (
        <MetadataModal image={focusedImage} onClose={() => setShowMetadata(false)} />
      )}

      {/* ── Main image area ── */}
      <div className="relative flex flex-1 min-h-0 items-center justify-center">
        {inGroup && !isLoading && (
          <button
            type="button"
            onClick={backToGroup}
            title="Back to the whole group (Esc)"
            className="absolute left-3 top-3 z-10 rounded-lg bg-slate-900/80 px-2.5 py-1 text-xs font-semibold text-slate-200 backdrop-blur-sm transition-colors hover:bg-violet-600"
          >
            ← {groupTitle(groupImages)}
          </button>
        )}
        {isLoading && streamPreview ? (
          /* Streaming: show live preview full-size */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={streamPreview}
            alt="Generating…"
            className="max-h-full max-w-full object-contain opacity-90"
          />
        ) : isLoading ? (
          /* Non-streaming: centered spinner */
          <div className="flex flex-col items-center gap-3 text-slate-600">
            <Spinner className="h-10 w-10 animate-spin text-violet-500" />
            <span className="text-sm">Generating…</span>
          </div>
        ) : focusedImage ? (
          /* Focused image (or original when held). One from a batch goes back
             to its grid when clicked, as novelai.net's canvas does. */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={displayUrl}
            alt={focusedImage.prompt}
            onClick={inGroup ? backToGroup : undefined}
            title={inGroup ? 'Back to the whole group (Esc)' : undefined}
            className={`max-h-full max-w-full object-contain ${inGroup ? 'cursor-zoom-out' : ''}`}
          />
        ) : groupImages.length > 0 ? (
          <BatchGrid images={groupImages} title={groupTitle(groupImages)} />
        ) : (
          /* Empty state */
          <div className="text-center text-slate-700">
            <div className="mb-4 text-7xl opacity-15 select-none">🖼</div>
            <p className="text-sm">Generated images will appear here</p>
          </div>
        )}
      </div>

      {/* ── Enhance panel ── */}
      {showEnhance && focusedImage && !isLoading && (
        <div className="border-t border-slate-700/60 bg-slate-900/95 px-4 py-3 backdrop-blur-sm">
          {/* Level selector */}
          <div className="mb-2.5 flex items-center gap-2.5">
            <span className="flex-shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Level
            </span>
            <div className="flex gap-1.5">
              {ENHANCE_LEVELS.map((l) => (
                <button
                  key={l.level}
                  type="button"
                  onClick={() => setEnhanceLevel(l.level)}
                  title={`Strength ${l.strength}, Noise ${l.noise}`}
                  className={`flex flex-col items-center rounded px-2.5 py-1 text-xs transition-colors ${
                    enhanceLevel === l.level
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  <span className="font-semibold leading-tight">{l.level}</span>
                  <span className="text-[10px] leading-tight opacity-70">{l.strength}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Scale + action row */}
          <div className="flex flex-wrap items-center gap-3">
            {enhanceOptions.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="flex-shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Scale
                </span>
                {/* Smallest first, as NovelAI lists them. */}
                {[...enhanceOptions].reverse().map((scale) => {
                  const out = enhanceOutputSize(imgW, imgH, scale);
                  return (
                    <button
                      key={String(scale)}
                      type="button"
                      onClick={() => pickEnhanceScale(scale)}
                      title={
                        scale === 'max'
                          ? `Re-renders at this size, then NovelAI upscales it (to about ${out.width}×${out.height})`
                          : `${out.width}×${out.height}`
                      }
                      className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                        enhanceScale === scale ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {scaleLabel(scale)}
                    </button>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              onClick={handleEnhance}
              disabled={isEnhancing || chainBusy || enhanceScale === null}
              title={cantEnhance ?? undefined}
              className="ml-auto rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isEnhancing
                ? 'Enhancing…'
                : subscription && enhanceScale !== null
                  ? enhanceCost > 0 ? `Enhance — ~${enhanceCost} Anlas` : 'Enhance — Free'
                  : 'Enhance Image'}
            </button>
          </div>

          {cantEnhance && <p className="mt-2 text-xs text-amber-400">{cantEnhance}</p>}

          {/* Enhance error */}
          {enhanceError && (
            <div className="mt-2 flex items-start justify-between gap-2 rounded border border-red-700/40 bg-red-900/30 px-2.5 py-1.5 text-xs text-red-300">
              <span>{enhanceError}</span>
              <button
                type="button"
                onClick={clearEnhanceError}
                className="flex-shrink-0 text-red-500 transition-colors hover:text-red-300"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Variations / Upscale errors ── */}
      {(variationsError || upscaleError) && focusedImage && !isLoading && (
        <div className="flex items-start justify-between gap-2 border-t border-red-700/40 bg-red-900/30 px-4 py-1.5 text-xs text-red-300">
          <span>{variationsError ?? upscaleError}</span>
          <button
            type="button"
            onClick={() => { clearVariationsError(); clearUpscaleError(); }}
            className="flex-shrink-0 text-red-500 transition-colors hover:text-red-300"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Bottom bar ── */}
      {focusedImage && !isLoading && (
        <div className="flex flex-shrink-0 items-center gap-3 border-t border-slate-800/60 bg-slate-900/95 px-4 py-2.5 backdrop-blur-sm phone:flex-col phone:items-stretch phone:backdrop-blur-none phone:gap-2 phone:px-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex-shrink-0 text-xs text-slate-600">
              {focusedImage.parameters.width}×{focusedImage.parameters.height}
            </span>
            <p className="min-w-0 flex-1 truncate text-xs text-slate-500" title={focusedImage.prompt}>
              {focusedImage.prompt}
            </p>
          </div>
          {/* On a phone the actions are one row that scrolls sideways. */}
          <div className="flex flex-shrink-0 items-center gap-2 phone:-mx-3 phone:overflow-x-auto phone:px-3 phone:pb-1 phone:*:flex-shrink-0 phone:*:whitespace-nowrap">
            {/* "Hold to view original" — only shown for enhanced images */}
            {focusedImage.sourceImageUrl && (
              <button
                type="button"
                title="Hold to compare with original"
                onMouseDown={() => setViewingOriginal(true)}
                onMouseUp={() => setViewingOriginal(false)}
                onMouseLeave={() => setViewingOriginal(false)}
                onTouchStart={() => setViewingOriginal(true)}
                onTouchEnd={() => setViewingOriginal(false)}
                onTouchCancel={() => setViewingOriginal(false)}
                // A long press would otherwise open the phone's menu.
                onContextMenu={(e) => e.preventDefault()}
                className={`select-none [-webkit-touch-callout:none] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  viewingOriginal
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {viewingOriginal ? 'Original' : 'Hold: Original'}
              </button>
            )}
            <button
              type="button"
              onClick={() => openCanvas('paint')}
              disabled={chainBusy || !!renderTooLarge}
              title={renderTooLarge ?? undefined}
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => openCanvas('mask')}
              disabled={chainBusy || !!renderTooLarge}
              title={renderTooLarge ?? undefined}
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Inpaint
            </button>
            <button
              type="button"
              onClick={() => setShowDirectorTools(true)}
              disabled={chainBusy}
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Tools
            </button>
            <button
              type="button"
              onClick={() => setShowMetadata(true)}
              title="View this image's embedded generation metadata"
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-600"
            >
              Metadata
            </button>
            <button
              type="button"
              onClick={() => setShowReuse(true)}
              title="Load this image's prompt and settings back into the sidebar"
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-600"
            >
              Reuse
            </button>
            <button
              type="button"
              onClick={() => { clearVariationsError(); generateVariations(focusedImage); }}
              disabled={isGeneratingVariations || chainBusy || !!renderTooLarge}
              title={renderTooLarge ?? (subscription ? `Generates ${VARIATION_COUNT} variants in one batch` : undefined)}
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGeneratingVariations
                ? 'Generating…'
                : subscription && !renderTooLarge
                  ? variationsCost > 0 ? `Variations — ~${variationsCost} Anlas` : 'Variations — Free'
                  : 'Variations'}
            </button>
            <button
              type="button"
              onClick={() => { clearUpscaleError(); upscale(focusedImage); }}
              disabled={isUpscaling || chainBusy || !!upscaleTooLarge}
              title={upscaleTooLarge ?? undefined}
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUpscaling ? 'Upscaling…' : upscalePrice && !upscaleTooLarge ? `Upscale — ~${upscalePrice} Anlas` : 'Upscale'}
            </button>
            <button
              type="button"
              title="Use this image as the base for your next generation"
              onClick={handleUseAsBase}
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-600"
            >
              {baseImageSet ? 'Base set!' : 'Use as Base'}
            </button>
            <button
              type="button"
              title="Use this seed"
              onClick={() => {
                setSeed('seed', focusedImage.seed);
                setSeedCopied(true);
                setTimeout(() => setSeedCopied(false), 1200);
              }}
              className="text-xs text-slate-500 transition-colors hover:text-violet-400"
            >
              {seedCopied ? 'Seed set!' : `Seed: ${focusedImage.seed}`}
            </button>
            <button
              type="button"
              onClick={() => { clearEnhanceError(); setShowEnhance((v) => !v); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                showEnhance
                  ? 'bg-violet-600 text-white hover:bg-violet-500'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Enhance
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowChains((v) => !v)}
                disabled={chainBusy}
                title="Run a saved chain of actions on this image"
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  showChains ? 'bg-violet-600 text-white hover:bg-violet-500' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Chain
              </button>
              {showChains && (
                // On a phone the row scrolls, which would clip it, so it's
                // pinned above the bars instead (the bar above has no blur
                // there, which would otherwise be what it's fixed to).
                <div className="absolute bottom-full right-0 z-30 mb-2 flex w-64 flex-col gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1.5 shadow-2xl phone:fixed phone:inset-x-3 phone:bottom-[calc(var(--bar-h)+6.5rem)] phone:mb-0 phone:w-auto phone:whitespace-normal">
                  {chains.map((chain) => (
                    <button
                      key={chain.id}
                      type="button"
                      onClick={() => {
                        setShowChains(false);
                        launchChain(chain, [focusedImage]);
                      }}
                      className="flex flex-col items-start rounded px-2 py-1.5 text-left transition-colors hover:bg-slate-800"
                    >
                      <span className="text-xs font-semibold text-slate-200">{chain.name}</span>
                      <span className="w-full truncate text-[10px] text-slate-500">{chainSummary(chain)}</span>
                    </button>
                  ))}
                  {chains.length === 0 && (
                    <p className="px-2 py-1.5 text-xs text-slate-500">
                      No chains yet. Make one under Chains in the sidebar.
                    </p>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => downloadImage(focusedImage)}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500"
            >
              Download
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
