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
