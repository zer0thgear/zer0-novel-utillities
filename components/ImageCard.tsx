'use client';

import { useSessionStore } from '@/store/sessionStore';
import { GeneratedImage } from '@/types/novelai';

interface ImageCardProps {
  image: GeneratedImage;
  focused: boolean;
  /** While the history is selecting, a click ticks the image instead of
   *  opening it, and the remove button gives way to a tick box. */
  selecting?: boolean;
  selected?: boolean;
  onToggle?: (id: string) => void;
}

export function ImageCard({ image, focused, selecting, selected, onToggle }: ImageCardProps) {
  const { setFocusedImageId, removeImage, togglePin } = useSessionStore();

  return (
    <div
      onClick={() => (selecting ? onToggle?.(image.id) : setFocusedImageId(image.id))}
      className={`group relative cursor-pointer overflow-hidden rounded-lg border transition-colors ${
        selecting && selected
          ? 'border-violet-400 ring-2 ring-violet-400/50'
          : focused && !selecting
            ? 'border-violet-500 ring-1 ring-violet-500/30'
            : 'border-slate-700 hover:border-slate-500'
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.url}
        alt={image.prompt}
        className="w-full object-cover"
      />

      {/* Enhanced badge — semi-transparent sparkle icon */}
      {image.sourceImageId && (
        <div
          className="pointer-events-none absolute bottom-1 left-1 flex items-center gap-0.5 rounded bg-black/50 px-1 py-0.5 text-[9px] font-semibold text-violet-300/80"
          title="Enhanced image"
        >
          ✦
        </div>
      )}

      {/* Sweep cell caption, e.g. "5 · Euler" */}
      {image.sweep && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-1 pb-0.5 pt-2 text-[9px] font-semibold text-slate-200"
          title={[
            `${image.sweep.x.name}: ${image.sweep.x.values[image.sweep.xIndex]}`,
            image.sweep.y && `${image.sweep.y.name}: ${image.sweep.y.values[image.sweep.yIndex ?? 0]}`,
          ].filter(Boolean).join('\n')}
        >
          {image.sweep.x.values[image.sweep.xIndex]}
          {image.sweep.y && ` · ${image.sweep.y.values[image.sweep.yIndex ?? 0]}`}
        </div>
      )}

      {/* Chain step caption, e.g. "2/3 · Upscale ×2" (a sweep cell shows its
          values instead) */}
      {image.chain && !image.sweep && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-1 pb-0.5 pt-2 text-[9px] font-semibold text-slate-200"
          title={`Chain "${image.chain.name}", step ${image.chain.step} of ${image.chain.total}: ${image.chain.label}`}
        >
          {image.chain.step}/{image.chain.total} · {image.chain.label}
        </div>
      )}

      {/* Pin — always shown once pinned, so what survives a clear is obvious. */}
      {!selecting && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); togglePin(image.id); }}
          title={image.pinned ? 'Unpin (it would be cleared with the rest)' : 'Pin — keeps it through Clear Session'}
          className={`absolute left-1 top-1 h-5 w-5 items-center justify-center rounded-full text-[10px] transition-colors ${
            image.pinned
              ? 'flex bg-violet-600/90 text-white hover:bg-violet-500'
              : 'hidden bg-black/70 text-slate-400 hover:bg-violet-600 hover:text-white group-hover:flex touch:flex touch:opacity-60'
          }`}
        >
          📌
        </button>
      )}

      {selecting ? (
        /* Tick box — always visible while selecting, so the state is readable
           at a glance without hovering every card. */
        <div
          className={`pointer-events-none absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded border text-[10px] font-bold ${
            selected ? 'border-violet-300 bg-violet-500 text-white' : 'border-slate-400/70 bg-black/60'
          }`}
        >
          {selected ? '✓' : ''}
        </div>
      ) : (
        /* Remove button — visible on hover. A touch screen removes through
           Select instead, rather than a ✕ on every thumbnail. */
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); removeImage(image.id); }}
          title="Remove"
          className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[10px] text-slate-400 transition-colors hover:bg-red-600 hover:text-white group-hover:flex"
        >
          ✕
        </button>
      )}
    </div>
  );
}
