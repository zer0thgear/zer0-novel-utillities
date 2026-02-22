'use client';

import { useEffect, useState } from 'react';
import { downloadImage } from '@/lib/imageUtils';
import { useSessionStore } from '@/store/sessionStore';
import { GeneratedImage } from '@/types/novelai';

interface ImageCardProps {
  image: GeneratedImage;
}

export function ImageCard({ image }: ImageCardProps) {
  const removeImage = useSessionStore((s) => s.removeImage);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Close on Escape key
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen]);

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
          onClick={() => setLightboxOpen(false)}
        >
          {/* Stop clicks on the inner panel from closing */}
          <div
            className="relative flex max-h-[95vh] max-w-[95vw] flex-col overflow-hidden rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt={image.prompt}
              className="max-h-[85vh] max-w-[95vw] object-contain"
            />

            {/* Bottom bar */}
            <div className="flex items-center justify-between gap-4 bg-slate-900/95 px-4 py-3 backdrop-blur-sm">
              <p className="min-w-0 flex-1 truncate text-xs text-slate-400" title={image.prompt}>
                {image.prompt}
              </p>
              <div className="flex flex-shrink-0 items-center gap-2">
                <span className="text-xs text-slate-600">Seed: {image.seed}</span>
                <button
                  onClick={() => downloadImage(image)}
                  className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 transition-colors"
                >
                  Download
                </button>
                <button
                  onClick={() => setLightboxOpen(false)}
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
