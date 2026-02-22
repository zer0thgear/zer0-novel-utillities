'use client';

import { downloadImage } from '@/lib/imageUtils';
import { useSessionStore } from '@/store/sessionStore';
import { GeneratedImage } from '@/types/novelai';

interface ImageCardProps {
  image: GeneratedImage;
}

export function ImageCard({ image }: ImageCardProps) {
  const removeImage = useSessionStore((s) => s.removeImage);

  return (
    <div className="group relative overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.url}
        alt={image.prompt}
        className="w-full cursor-zoom-in object-cover transition-transform duration-200 group-hover:scale-[1.02]"
        onClick={() => window.open(image.url, '_blank')}
      />

      {/* Hover overlay */}
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
        <div className="p-3 space-y-2">
          <p className="line-clamp-2 text-xs text-slate-300 leading-relaxed">
            {image.prompt}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => downloadImage(image)}
              className="flex-1 rounded bg-violet-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 transition-colors"
            >
              Download
            </button>
            <button
              onClick={() => removeImage(image.id)}
              className="rounded bg-slate-600/80 px-2 py-1.5 text-xs text-slate-300 hover:bg-red-600 hover:text-white transition-colors"
              title="Remove from session"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
