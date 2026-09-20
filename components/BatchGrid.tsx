'use client';

import { useState } from 'react';
import { GeneratedImage } from '@/types/novelai';
import { useSessionStore } from '@/store/sessionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useChainBusy } from '@/store/chainStore';
import { useChainLauncher } from '@/hooks/useChainLauncher';
import { downloadImage } from '@/lib/imageUtils';

interface Props {
  /** The group's images, in the order they were made. */
  images: GeneratedImage[];
  /** e.g. "Batch of 4". */
  title: string;
}

/** Columns for a near-square grid: 2×2 for four, 3 across for up to nine. */
const columnsFor = (n: number) => (n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4);

/**
 * A group of images shown together on the canvas, like NovelAI shows a
 * multi-image generation. Click one to open it (with all its actions); each
 * has quick Download, Copy and Use seed buttons on hover, as NovelAI's do.
 */
export function BatchGrid({ images, title }: Props) {
  const setFocusedImageId = useSessionStore((s) => s.setFocusedImageId);
  const togglePin = useSessionStore((s) => s.togglePin);
  const setForm = useSettingsStore((s) => s.set);
  const chains = useSettingsStore((s) => s.chains);
  const launchChain = useChainLauncher();
  const chainBusy = useChainBusy();
  const [pickingChain, setPickingChain] = useState(false);
  const [flash, setFlash] = useState<{ id: string; text: string } | null>(null);
  const cols = columnsFor(images.length);
  const rows = Math.ceil(images.length / cols);

  const notify = (id: string, text: string) => {
    setFlash({ id, text });
    setTimeout(() => setFlash((f) => (f?.id === id ? null : f)), 1200);
  };

  async function copyImage(image: GeneratedImage) {
    try {
      const png = image.blob.type === 'image/png' ? image.blob : new Blob([image.blob], { type: 'image/png' });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      notify(image.id, 'Copied!');
    } catch {
      notify(image.id, "Couldn't copy");
    }
  }

  const miniBtn =
    'rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-slate-200 backdrop-blur-sm transition-colors hover:bg-violet-600';

  return (
    <div className="flex h-full w-full flex-col items-center gap-2 p-3">
      <div className="flex w-full flex-shrink-0 items-center justify-center gap-3 text-xs text-slate-500">
        <p>
          <span className="font-semibold text-slate-300">{title}</span> · click an image to open it
        </p>
        {/* A chain applies to every image here, priced for all of them at once. */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickingChain((v) => !v)}
            disabled={chainBusy}
            title={chainBusy ? 'Wait for the running chain to finish' : `Run a saved chain on all ${images.length}`}
            className="rounded bg-slate-700/80 px-2 py-0.5 text-xs text-slate-300 transition-colors hover:bg-violet-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-slate-700/80 disabled:hover:text-slate-300"
          >
            Chain all {images.length}
          </button>
          {pickingChain && (
            <div className="absolute right-0 top-full z-30 mt-1 flex w-64 flex-col gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1.5 shadow-2xl">
              {chains.length > 0 ? (
                chains.map((chain) => (
                  <button
                    key={chain.id}
                    type="button"
                    onClick={() => {
                      setPickingChain(false);
                      launchChain(chain, images);
                    }}
                    className="rounded px-2 py-1 text-left text-xs text-slate-200 transition-colors hover:bg-violet-600"
                  >
                    {chain.name}
                  </button>
                ))
              ) : (
                <p className="px-2 py-1 text-left text-xs text-slate-500">
                  No chains yet. Make one under Chains in the sidebar.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      <div
        className="grid min-h-0 w-full flex-1 gap-2"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
      >
        {images.map((image) => (
          <div key={image.id} className="group relative flex min-h-0 items-center justify-center">
            <button
              type="button"
              onClick={() => setFocusedImageId(image.id)}
              title="Open this image"
              className="flex h-full w-full items-center justify-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={image.prompt}
                className="max-h-full max-w-full rounded object-contain transition-opacity group-hover:opacity-90"
              />
            </button>
            <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
              {flash?.id === image.id ? (
                <span className={miniBtn}>{flash.text}</span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => togglePin(image.id)}
                    className={miniBtn}
                    title={image.pinned ? 'Unpin' : 'Pin — keeps it through Clear Session'}
                  >
                    {image.pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button type="button" onClick={() => downloadImage(image)} className={miniBtn} title="Download">
                    Download
                  </button>
                  <button type="button" onClick={() => copyImage(image)} className={miniBtn} title="Copy the image">
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm('seed', image.seed);
                      notify(image.id, 'Seed set!');
                    }}
                    className={miniBtn}
                    title={`Use seed ${image.seed}`}
                  >
                    Use seed
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
