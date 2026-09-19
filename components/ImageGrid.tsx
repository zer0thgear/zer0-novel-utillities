'use client';

import { useEffect, useState } from 'react';
import { downloadSessionAsZip } from '@/lib/imageUtils';
import { useSessionStore } from '@/store/sessionStore';
import { useChainBusy } from '@/store/chainStore';
import { GeneratedImage } from '@/types/novelai';
import { ImageCard } from './ImageCard';
import { SweepGridModal } from './SweepGridModal';

// Groups consecutive images sharing a batchId — a Copies batch/queue run or a
// multi-prompt Batch run always lands adjacent in the array since nothing else
// generates mid-run.
function groupConsecutiveByBatch(images: GeneratedImage[]): GeneratedImage[][] {
  const groups: GeneratedImage[][] = [];
  for (const image of images) {
    const last = groups[groups.length - 1];
    if (image.batchId && last?.[0]?.batchId === image.batchId) {
      last.push(image);
    } else {
      groups.push([image]);
    }
  }
  return groups;
}

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

export function HistoryStrip() {
  const { images, focusedImageId, isLoading, streamPreview, clearImages, focusedGroupId, showGroup } = useSessionStore();
  const [collapsed, setCollapsed] = useState(false);
  const [gridSweepId, setGridSweepId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  // A running chain is still adding to (and reading from) the history.
  const chainBusy = useChainBusy();

  // ── Collapsed state ──────────────────────────────────────────────────────

  if (collapsed) {
    return (
      <div className="flex w-8 flex-shrink-0 flex-col items-center border-l border-slate-800 bg-slate-900/40 py-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Show history"
          className="text-slate-500 transition-colors hover:text-slate-300"
        >
          {/* Left-pointing chevron (expand) */}
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>
    );
  }

  // ── Expanded state ───────────────────────────────────────────────────────

  return (
    <div className="flex w-48 flex-shrink-0 flex-col border-l border-slate-800 bg-slate-900/40">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-800 px-3 py-2">
        <span className="text-xs font-semibold text-slate-400">
          History
          {images.length > 0 && (
            <span className="ml-1 font-normal text-slate-600">({images.length})</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Collapse"
          className="text-slate-500 transition-colors hover:text-slate-300"
        >
          {/* Right-pointing chevron (collapse) */}
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Session controls */}
      {images.length > 0 && (
        <div className="flex flex-shrink-0 flex-col gap-1 border-b border-slate-800 px-2 py-2">
          <button
            type="button"
            onClick={() => downloadSessionAsZip(images)}
            className="rounded bg-slate-700/80 px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-600"
          >
            Download ZIP
          </button>
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            disabled={isLoading || chainBusy}
            title={isLoading || chainBusy ? 'Wait for the current generation to finish' : undefined}
            className="rounded bg-slate-700/80 px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-red-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-slate-700/80 disabled:hover:text-slate-400"
          >
            Clear Session
          </button>
        </div>
      )}

      {/* Scroll container — constrained height, scrolls */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Layout container — unconstrained height, grows with content */}
        <div className="flex flex-col gap-2 p-2">
          {/* Loading placeholder — newest item slot */}
          {isLoading && (
            streamPreview ? (
              <div className="relative overflow-hidden rounded-lg border border-violet-500/50 bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={streamPreview}
                  alt="Generating…"
                  className="w-full opacity-80"
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-gradient-to-t from-black/70 pb-1.5 pt-3 text-xs text-slate-300">
                  <Spinner className="h-2.5 w-2.5 animate-spin text-violet-400" />
                  Generating…
                </div>
              </div>
            ) : (
              <div className="flex aspect-[2/3] animate-pulse items-center justify-center rounded-lg border border-violet-500/30 bg-slate-800/60">
                <Spinner className="h-5 w-5 animate-spin text-violet-400" />
              </div>
            )
          )}

          {/* Empty state */}
          {images.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-xs text-slate-700">No images yet</p>
            </div>
          )}

          {/* Thumbnails — newest first, consecutive images sharing a batchId
              (Copies, a multi-prompt Batch, a sweep or a chain) are clumped into one 2-col grid
              so they read as one generation while staying individually
              clickable/removable. */}
          {groupConsecutiveByBatch(images).map((group) =>
            // A sweep or chain keeps its header even with one image (stopped
            // early, or a one-step chain); other one-image groups are cards.
            group.length === 1 && !group[0].sweep && !group[0].chain ? (
              <ImageCard key={group[0].id} image={group[0]} focused={group[0].id === focusedImageId} />
            ) : (
              <div
                key={group[0].batchId}
                className={`rounded-lg border p-1.5 transition-colors ${
                  focusedGroupId === group[0].batchId && !focusedImageId
                    ? 'border-violet-500 bg-violet-950/30'
                    : 'border-violet-700/30 bg-violet-950/10'
                }`}
              >
                {/* Each header opens the whole group on the canvas, as NovelAI does. */}
                {group[0].chain ? (
                  <div className="mb-1.5 flex items-center justify-between gap-1 px-0.5">
                    <button
                      type="button"
                      onClick={() => showGroup(group[0].batchId!)}
                      className="min-w-0 truncate text-left text-[10px] font-semibold uppercase tracking-wider text-violet-400/80 transition-colors hover:text-violet-200"
                      title={`Chain "${group[0].chain.name}": show every step's image together (oldest first)`}
                    >
                      Chain · {group[0].chain.name}
                    </button>
                    {/* A chain ending in a Sweep step can open that sweep's grid. */}
                    {group.some((img) => img.sweep) && (
                      <button
                        type="button"
                        onClick={() => setGridSweepId(group.find((img) => img.sweep)!.sweep!.id)}
                        title="Open the sweep as a labelled grid"
                        className="flex-shrink-0 rounded bg-violet-600/30 px-1.5 py-0.5 text-[10px] font-semibold text-violet-200 transition-colors hover:bg-violet-600"
                      >
                        Grid
                      </button>
                    )}
                  </div>
                ) : group[0].sweep ? (
                  <div className="mb-1.5 flex items-center justify-between gap-1 px-0.5">
                    <button
                      type="button"
                      onClick={() => showGroup(group[0].batchId!)}
                      className="min-w-0 truncate text-left text-[10px] font-semibold uppercase tracking-wider text-violet-400/80 transition-colors hover:text-violet-200"
                      title={`Sweep: ${group[0].sweep.x.name}${group[0].sweep.y ? ` × ${group[0].sweep.y.name}` : ''}. Show every image together`}
                    >
                      Sweep · {group[0].sweep.x.name}
                      {group[0].sweep.y && ` × ${group[0].sweep.y.name}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setGridSweepId(group[0].sweep!.id)}
                      title="Open as a labelled grid"
                      className="flex-shrink-0 rounded bg-violet-600/30 px-1.5 py-0.5 text-[10px] font-semibold text-violet-200 transition-colors hover:bg-violet-600"
                    >
                      Grid
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => showGroup(group[0].batchId!)}
                    className="mb-1.5 block w-full px-0.5 min-w-0 truncate text-left text-[10px] font-semibold uppercase tracking-wider text-violet-400/80 transition-colors hover:text-violet-200"
                    title="Show the whole batch on the canvas"
                  >
                    Batch of {group.length}
                  </button>
                )}
                <div className="grid grid-cols-2 gap-1.5">
                  {group.map((image) => (
                    <ImageCard key={image.id} image={image} focused={image.id === focusedImageId} />
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {gridSweepId && <SweepGridModal sweepId={gridSweepId} onClose={() => setGridSweepId(null)} />}
      {confirmClear && images.length > 0 && (
        <ClearSessionModal images={images} onClear={clearImages} onClose={() => setConfirmClear(false)} />
      )}
    </div>
  );
}

// ─── Clear Session confirmation ───────────────────────────────────────────────

function ClearSessionModal({
  images,
  onClear,
  onClose,
}: {
  images: GeneratedImage[];
  onClear: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const count = images.length;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <h2 className="text-sm font-bold text-slate-100">
          Clear {count === 1 ? 'the 1 image' : `all ${count} images`} from this session?
        </h2>
        <p className="text-xs text-slate-400">
          History is only kept in memory, so this can&apos;t be undone. Download a ZIP first to keep them.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => downloadSessionAsZip(images)}
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-600"
          >
            Download ZIP
          </button>
          <button
            type="button"
            onClick={() => {
              onClear();
              onClose();
            }}
            className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
