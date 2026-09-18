'use client';

import { useState } from 'react';
import { downloadImage, getImageDimensions } from '@/lib/imageUtils';
import { useSessionStore } from '@/store/sessionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useEnhance, ENHANCE_LEVELS, EnhanceLevelNum } from '@/hooks/useEnhance';
import { useVariations, VARIATION_COUNT, VARIATION_STRENGTH } from '@/hooks/useVariations';
import { useChainLauncher } from '@/hooks/useChainLauncher';
import { useChainBusy } from '@/store/chainStore';
import { chainSummary } from '@/lib/chains';
import { useUpscale } from '@/hooks/useUpscale';
import { useSubscription } from '@/hooks/useSubscription';
import { calculateAnlasCost, opusStatus, upscaleCost } from '@/lib/anlasCost';
import { InpaintModal } from './InpaintModal';
import { EditModal } from './EditModal';
import { DirectorToolsModal } from './DirectorToolsModal';
import { MetadataModal } from './MetadataModal';
import { DEFAULT_IMPORT, ImportModal } from './ImportModal';
import { metadataFromImage } from '@/lib/naiMetadata';

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

export function ImageViewer() {
  const { images, focusedImageId, isLoading, streamPreview, setImg2imgSource } = useSessionStore();
  const setSeed = useSettingsStore((s) => s.set);
  const form = useSettingsStore();
  const { subscription } = useSubscription();
  const opus = opusStatus(subscription);

  const focusedImage = images.find((img) => img.id === focusedImageId) ?? null;

  const [showEnhance, setShowEnhance] = useState(false);
  const [enhanceLevel, setEnhanceLevel] = useState<EnhanceLevelNum>(3);
  const [enhanceUpscale, setEnhanceUpscale] = useState(false);
  const [seedCopied, setSeedCopied] = useState(false);
  // True while the "view original" button is held down
  const [viewingOriginal, setViewingOriginal] = useState(false);
  const [showInpaint, setShowInpaint] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDirectorTools, setShowDirectorTools] = useState(false);
  const [baseImageSet, setBaseImageSet] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [showReuse, setShowReuse] = useState(false);
  const [showChains, setShowChains] = useState(false);
  const chains = useSettingsStore((s) => s.chains);
  const launchChain = useChainLauncher();
  // While a chain runs, other image actions wait so requests never overlap.
  const chainBusy = useChainBusy();

  const { enhance, isEnhancing, error: enhanceError, clearError: clearEnhanceError } = useEnhance();
  const { generateVariations, isGeneratingVariations, error: variationsError, clearError: clearVariationsError } = useVariations();
  const { upscale, isUpscaling, error: upscaleError, clearError: clearUpscaleError } = useUpscale();

  // Mirrors useEnhance.ts's own dimension math so the displayed cost matches
  // what it will actually request.
  const round64 = (n: number) => Math.round(n / 64) * 64;
  const enhanceCost = focusedImage
    ? calculateAnlasCost({
        model: form.model,
        width: enhanceUpscale ? round64(focusedImage.parameters.width * 1.5) : focusedImage.parameters.width,
        height: enhanceUpscale ? round64(focusedImage.parameters.height * 1.5) : focusedImage.parameters.height,
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

  // Reset transient state whenever the focused image changes. Done during
  // render (React's pattern for state derived from a prop change) rather than
  // in an effect, so the new image never renders with the old image's panels.
  const [stateFor, setStateFor] = useState(focusedImageId);
  if (stateFor !== focusedImageId) {
    setStateFor(focusedImageId);
    setViewingOriginal(false);
    setShowEnhance(false);
    setShowInpaint(false);
    setShowEdit(false);
    setShowDirectorTools(false);
    setBaseImageSet(false);
    setShowMetadata(false);
    setShowChains(false);
  }

  const handleEnhance = async () => {
    if (!focusedImage) return;
    setShowEnhance(false);
    await enhance(focusedImage, enhanceLevel, enhanceUpscale);
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
      {showInpaint && focusedImage && (
        <InpaintModal image={focusedImage} onClose={() => setShowInpaint(false)} />
      )}
      {showEdit && focusedImage && (
        <EditModal image={focusedImage} onClose={() => setShowEdit(false)} />
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
      <div className="flex flex-1 min-h-0 items-center justify-center">
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
          /* Focused image (or original when held) */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={displayUrl}
            alt={focusedImage.prompt}
            className="max-h-full max-w-full object-contain"
          />
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

          {/* Upscale + action row */}
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={enhanceUpscale}
                onChange={(e) => setEnhanceUpscale(e.target.checked)}
                className="h-3.5 w-3.5 accent-violet-500"
              />
              Upscale ×1.5
            </label>
            <button
              type="button"
              onClick={handleEnhance}
              disabled={isEnhancing || chainBusy}
              className="ml-auto rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isEnhancing
                ? 'Enhancing…'
                : subscription
                  ? enhanceCost > 0 ? `Enhance — ~${enhanceCost} Anlas` : 'Enhance — Free'
                  : 'Enhance Image'}
            </button>
          </div>

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
        <div className="flex flex-shrink-0 items-center gap-3 border-t border-slate-800/60 bg-slate-900/95 px-4 py-2.5 backdrop-blur-sm">
          <span className="flex-shrink-0 text-xs text-slate-600">
            {focusedImage.parameters.width}×{focusedImage.parameters.height}
          </span>
          <p className="min-w-0 flex-1 truncate text-xs text-slate-500" title={focusedImage.prompt}>
            {focusedImage.prompt}
          </p>
          <div className="flex flex-shrink-0 items-center gap-2">
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
                className={`select-none rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
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
              onClick={() => setShowEdit(true)}
              disabled={chainBusy}
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setShowInpaint(true)}
              disabled={chainBusy}
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
              disabled={isGeneratingVariations || chainBusy}
              title={subscription ? `Generates ${VARIATION_COUNT} variants in one batch` : undefined}
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGeneratingVariations
                ? 'Generating…'
                : subscription
                  ? variationsCost > 0 ? `Variations — ~${variationsCost} Anlas` : 'Variations — Free'
                  : 'Variations'}
            </button>
            <button
              type="button"
              onClick={() => { clearUpscaleError(); upscale(focusedImage); }}
              disabled={isUpscaling || chainBusy}
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUpscaling ? 'Upscaling…' : upscalePrice ? `Upscale — ~${upscalePrice} Anlas` : 'Upscale'}
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
                <div className="absolute bottom-full right-0 z-30 mb-2 flex w-64 flex-col gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1.5 shadow-2xl">
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
