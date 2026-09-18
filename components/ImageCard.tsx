'use client';

import { useSessionStore } from '@/store/sessionStore';
import { GeneratedImage } from '@/types/novelai';

interface ImageCardProps {
  image: GeneratedImage;
  focused: boolean;
}

export function ImageCard({ image, focused }: ImageCardProps) {
  const { setFocusedImageId, removeImage } = useSessionStore();

  return (
    <div
      onClick={() => setFocusedImageId(image.id)}
      className={`group relative cursor-pointer overflow-hidden rounded-lg border transition-colors ${
        focused
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

      {/* Remove button — visible on hover */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); removeImage(image.id); }}
        title="Remove"
        className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[10px] text-slate-400 transition-colors hover:bg-red-600 hover:text-white group-hover:flex"
      >
        ✕
      </button>
    </div>
  );
}
