'use client';

import { downloadSessionAsZip } from '@/lib/imageUtils';
import { useSessionStore } from '@/store/sessionStore';
import { ImageCard } from './ImageCard';

export function ImageGrid() {
  const { images, isLoading, clearImages } = useSessionStore();

  return (
    <div className="flex h-full flex-col">
      {/* Session controls */}
      {images.length > 0 && (
        <div className="mb-4 flex items-center justify-between px-1 flex-shrink-0">
          <span className="text-sm text-slate-400">
            {images.length} image{images.length !== 1 ? 's' : ''} this session
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => downloadSessionAsZip(images)}
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-600 transition-colors"
            >
              Download All (.zip)
            </button>
            <button
              onClick={clearImages}
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-red-700 hover:text-white transition-colors"
            >
              Clear Session
            </button>
          </div>
        </div>
      )}

      {/* Grid area */}
      <div className="flex-1 overflow-y-auto">
        {images.length === 0 && !isLoading ? (
          <div className="flex h-full min-h-64 items-center justify-center text-slate-600">
            <div className="text-center">
              <div className="text-5xl mb-3 opacity-30">🖼</div>
              <p className="text-sm">Generated images will appear here</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
            {/* Loading placeholder — appears at the front of the grid */}
            {isLoading && (
              <div className="flex aspect-[2/3] animate-pulse items-center justify-center rounded-lg border border-violet-500/30 bg-slate-800/60">
                <div className="flex flex-col items-center gap-2 text-slate-500">
                  <svg
                    className="h-7 w-7 animate-spin text-violet-400"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  <span className="text-xs">Generating…</span>
                </div>
              </div>
            )}

            {images.map((image) => (
              <ImageCard key={image.id} image={image} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
