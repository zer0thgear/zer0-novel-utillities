'use client';

import { useEffect, useState } from 'react';
import { downloadImage } from '@/lib/imageUtils';
import { useSessionStore } from '@/store/sessionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useEnhance, ENHANCE_LEVELS, EnhanceLevelNum } from '@/hooks/useEnhance';

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
  const { images, focusedImageId, isLoading, streamPreview } = useSessionStore();
  const setSeed = useSettingsStore((s) => s.set);

  const focusedImage = images.find((img) => img.id === focusedImageId) ?? null;

  const [showEnhance, setShowEnhance] = useState(false);
  const [enhanceLevel, setEnhanceLevel] = useState<EnhanceLevelNum>(3);
  const [enhanceUpscale, setEnhanceUpscale] = useState(false);
  const [seedCopied, setSeedCopied] = useState(false);
  // True while the "view original" button is held down
  const [viewingOriginal, setViewingOriginal] = useState(false);

  const { enhance, isEnhancing, error: enhanceError, clearError: clearEnhanceError } = useEnhance();

  // Reset transient state whenever the focused image changes
  useEffect(() => {
    setViewingOriginal(false);
    setShowEnhance(false);
  }, [focusedImageId]);

  const handleEnhance = async () => {
    if (!focusedImage) return;
    setShowEnhance(false);
    await enhance(focusedImage, enhanceLevel, enhanceUpscale);
  };

  // The URL to display — switches to source while "view original" is held
  const displayUrl =
    viewingOriginal && focusedImage?.sourceImageUrl
      ? focusedImage.sourceImageUrl
      : focusedImage?.url;

  return (
    <div className="flex h-full flex-col bg-slate-950">

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
                  <span className="text-[10px] leading-tight opacity-70">{l.anlas}A</span>
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
              <span className="text-slate-600">(extra Anlas)</span>
            </label>
            <button
              type="button"
              onClick={handleEnhance}
              disabled={isEnhancing}
              className="ml-auto rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isEnhancing ? 'Enhancing…' : 'Enhance Image'}
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
