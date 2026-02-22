'use client';

import { useEffect, useState } from 'react';
import { downloadImage } from '@/lib/imageUtils';
import { useSessionStore } from '@/store/sessionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useEnhance, ENHANCE_LEVELS, EnhanceLevelNum } from '@/hooks/useEnhance';
import { GeneratedImage } from '@/types/novelai';

interface ImageCardProps {
  image: GeneratedImage;
}

export function ImageCard({ image }: ImageCardProps) {
  const removeImage = useSessionStore((s) => s.removeImage);
  const setSeed = useSettingsStore((s) => s.set);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [showEnhance, setShowEnhance] = useState(false);
  const [enhanceLevel, setEnhanceLevel] = useState<EnhanceLevelNum>(3);
  const [enhanceUpscale, setEnhanceUpscale] = useState(false);
  const [seedCopied, setSeedCopied] = useState(false);
  const { enhance, isEnhancing, error: enhanceError, clearError: clearEnhanceError } = useEnhance();

  const handleLightboxClose = () => {
    setLightboxOpen(false);
    setShowEnhance(false);
    clearEnhanceError();
  };

  // Close on Escape key
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxOpen(false);
        setShowEnhance(false);
        clearEnhanceError();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEnhance = async () => {
    // Close the lightbox immediately so the user can see gallery progress
    setLightboxOpen(false);
    setShowEnhance(false);
    await enhance(image, enhanceLevel, enhanceUpscale);
  };

  return (
    <>
      {/* ── Grid thumbnail ── */}
      <div
        className="group relative overflow-hidden rounded-lg border border-slate-700 bg-slate-800 cursor-zoom-in"
        onClick={() => setLightboxOpen(true)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={image.prompt}
          className="w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
        />

        {/* Hover overlay */}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
          <div className="p-3 space-y-2">
            <p className="line-clamp-2 text-xs text-slate-300 leading-relaxed">
              {image.prompt}
            </p>
            <div className="flex gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); downloadImage(image); }}
                className="flex-1 rounded bg-violet-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 transition-colors"
              >
                Download
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); removeImage(image.id); }}
                className="rounded bg-slate-600/80 px-2 py-1.5 text-xs text-slate-300 hover:bg-red-600 hover:text-white transition-colors"
                title="Remove from session"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Lightbox ── */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm"
          onClick={handleLightboxClose}
        >
          {/* Stop clicks on the inner panel from closing */}
          <div
            className="relative flex max-h-[95vh] max-w-[95vw] flex-col overflow-hidden rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image — shrinks to leave room for panels below */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt={image.prompt}
              className="min-h-0 flex-1 max-h-[80vh] max-w-[95vw] object-contain"
            />

            {/* ── Enhance panel (shown when toggled) ── */}
            {showEnhance && (
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
                    className="ml-auto rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isEnhancing ? 'Enhancing…' : 'Enhance Image'}
                  </button>
                </div>

                {/* Enhance error */}
                {enhanceError && (
                  <div className="mt-2 flex items-start justify-between gap-2 rounded bg-red-900/30 border border-red-700/40 px-2.5 py-1.5 text-xs text-red-300">
                    <span>{enhanceError}</span>
                    <button
                      type="button"
                      onClick={clearEnhanceError}
                      className="flex-shrink-0 text-red-500 hover:text-red-300 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Bottom bar */}
            <div className="flex items-center justify-between gap-4 bg-slate-900/95 px-4 py-3 backdrop-blur-sm border-t border-slate-800/60">
              <p className="min-w-0 flex-1 truncate text-xs text-slate-400" title={image.prompt}>
                {image.prompt}
              </p>
              <div className="flex flex-shrink-0 items-center gap-2">
                <button
                  type="button"
                  title="Use this seed"
                  onClick={() => {
                    setSeed('seed', image.seed);
                    setSeedCopied(true);
                    setTimeout(() => setSeedCopied(false), 1200);
                  }}
                  className="text-xs transition-colors hover:text-violet-400 text-slate-500"
                >
                  {seedCopied ? 'Seed set!' : `Seed: ${image.seed}`}
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
                  onClick={() => downloadImage(image)}
                  className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 transition-colors"
                >
                  Download
                </button>
                <button
                  onClick={handleLightboxClose}
                  className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-600 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
