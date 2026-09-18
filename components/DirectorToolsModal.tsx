'use client';

import { useState } from 'react';
import { useAugment } from '@/hooks/useAugment';
import { usePixelSnap } from '@/hooks/usePixelSnap';
import { useSubscription } from '@/hooks/useSubscription';
import { directorToolCost, opusStatus } from '@/lib/anlasCost';
import { AugmentReqType, GeneratedImage } from '@/types/novelai';

interface DirectorToolsModalProps {
  image: GeneratedImage;
  onClose: () => void;
}

// 'pixel-snap' isn't a real augment-image req_type (it's a client-side filter —
// see hooks/usePixelSnap.ts), but it lives in the same tool picker as the rest.
type ToolKey = AugmentReqType | 'pixel-snap';

const TOOLS: { key: ToolKey; label: string; description: string }[] = [
  { key: 'bg-removal', label: 'Remove BG', description: 'Cuts the subject out onto a transparent background.' },
  { key: 'lineart', label: 'Line Art', description: 'Draws an outline of the image.' },
  { key: 'sketch', label: 'Sketch', description: 'Converts the image into a rough sketch.' },
  { key: 'colorize', label: 'Colorize', description: 'Colors a line art or sketch, optionally guided by a prompt.' },
  { key: 'emotion', label: 'Emotion', description: 'Changes the expression of a character. Works best on a neutral-emotion source image.' },
  { key: 'declutter', label: 'Declutter', description: 'Removes text, speech bubbles, and other overlays.' },
  { key: 'pixel-snap', label: 'Pixel Snap', description: 'Snaps the image to a pixel-art grid. Runs locally — free, no Anlas cost.' },
];

const EMOTIONS = ['Neutral', 'Happy', 'Sad', 'Angry', 'Scared', 'Surprised', 'Tired', 'Excited'];

type Palettize = 'off' | 'auto' | 'custom';

export function DirectorToolsModal({ image, onClose }: DirectorToolsModalProps) {
  const [tool, setTool] = useState<ToolKey>('bg-removal');
  const [defry, setDefry] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [emotion, setEmotion] = useState(EMOTIONS[0]);
  const [palettize, setPalettize] = useState<Palettize>('auto');
  const [colors, setColors] = useState(64);
  const [avoidOverRefining, setAvoidOverRefining] = useState(false);
  const [pixelUpscale, setPixelUpscale] = useState(false);

  const { augment, isAugmenting, error: augmentError, clearError: clearAugmentError } = useAugment();
  const { snap, isSnapping, error: snapError, clearError: clearSnapError } = usePixelSnap();

  const { subscription } = useSubscription();
  const activeTool = TOOLS.find((t) => t.key === tool)!;
  const cost =
    tool === 'pixel-snap'
      ? 0
      : subscription
        ? directorToolCost(tool, image.parameters.width, image.parameters.height, opusStatus(subscription))
        : null;
  const hasDefry = tool === 'colorize' || tool === 'emotion';
  const hasPrompt = tool === 'colorize';
  const isBusy = isAugmenting || isSnapping;
  const error = augmentError ?? snapError;
  const clearError = () => { clearAugmentError(); clearSnapError(); };

  const handleTransform = async () => {
    if (tool === 'pixel-snap') {
      onClose();
      await snap(image, { palettize, colors, avoidOverRefining, upscale: pixelUpscale });
      return;
    }

    const options =
      tool === 'emotion'
        ? { prompt: `${emotion.toLowerCase()};;${prompt}`, defry }
        : tool === 'colorize'
        ? { prompt: prompt || undefined, defry }
        : undefined;

    // Result is added to the session and auto-focused by useAugment/addImages;
    // close so the main viewer shows it, matching Edit/Inpaint's behavior.
    onClose();
    await augment(image, tool, options);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="flex h-full w-full max-h-screen flex-col overflow-hidden">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-slate-700 bg-slate-900 px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 transition-colors hover:text-slate-200"
            title="Close (Esc)"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-slate-300">Director Tools</span>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left toolbar */}
          <div className="flex w-52 flex-shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-700 bg-slate-900/90 p-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Tool</span>
              {TOOLS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => { setTool(t.key); clearError(); }}
                  className={`rounded px-3 py-1.5 text-left text-xs font-medium transition-colors ${
                    tool === t.key
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <p className="text-xs text-slate-500">{activeTool.description}</p>

            {tool === 'emotion' && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Emotion</span>
                <select
                  value={emotion}
                  onChange={(e) => setEmotion(e.target.value)}
                  className="rounded bg-slate-800 px-2 py-1.5 text-xs text-slate-200 outline-none border border-slate-700/60 focus:border-violet-500"
                >
                  {EMOTIONS.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>
            )}

            {hasPrompt && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Prompt (optional)
                </span>
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. blue hair"
                  className="rounded bg-slate-800 px-2 py-1.5 text-xs text-slate-200 outline-none border border-slate-700/60 focus:border-violet-500"
                />
              </div>
            )}
            {tool === 'emotion' && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Extra prompt (optional)
                </span>
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. blushing"
                  className="rounded bg-slate-800 px-2 py-1.5 text-xs text-slate-200 outline-none border border-slate-700/60 focus:border-violet-500"
                />
              </div>
            )}

            {hasDefry && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Defry — {defry}
                </span>
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={1}
                  value={defry}
                  onChange={(e) => setDefry(Number(e.target.value))}
                  className="w-full accent-violet-500"
                />
              </div>
            )}

            {tool === 'pixel-snap' && (
              <>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Palettize</span>
                  <div className="flex gap-1">
                    {(['off', 'auto', 'custom'] as Palettize[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPalettize(p)}
                        className={`flex-1 rounded px-2 py-1 text-xs font-medium capitalize transition-colors ${
                          palettize === p
                            ? 'bg-violet-600 text-white'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {palettize === 'custom' && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Colors — {colors}
                    </span>
                    <input
                      type="range"
                      min={2}
                      max={256}
                      step={1}
                      value={colors}
                      onChange={(e) => setColors(Number(e.target.value))}
                      className="w-full accent-violet-500"
                    />
                  </div>
                )}

                <label className="flex cursor-pointer items-center justify-between text-xs text-slate-400">
                  <span>Avoid Over-Refining</span>
                  <input
                    type="checkbox"
                    checked={avoidOverRefining}
                    onChange={(e) => setAvoidOverRefining(e.target.checked)}
                    className="h-3.5 w-3.5 accent-violet-500"
                  />
                </label>
                <label className="flex cursor-pointer items-center justify-between text-xs text-slate-400">
                  <span>Upscale</span>
                  <input
                    type="checkbox"
                    checked={pixelUpscale}
                    onChange={(e) => setPixelUpscale(e.target.checked)}
                    className="h-3.5 w-3.5 accent-violet-500"
                  />
                </label>
              </>
            )}

            <button
              type="button"
              onClick={handleTransform}
              disabled={isBusy}
              className="mt-auto rounded bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBusy
                ? 'Transforming…'
                : cost === null
                  ? 'Transform'
                  : cost > 0
                    ? `Transform — ~${cost} Anlas`
                    : 'Transform — Free'}
            </button>

            {error && (
              <div className="flex items-start justify-between gap-2 rounded border border-red-700/40 bg-red-900/30 px-2.5 py-1.5 text-xs text-red-300">
                <span>{error}</span>
                <button type="button" onClick={clearError} className="flex-shrink-0 text-red-500 hover:text-red-300">
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Preview area */}
          <div className="flex flex-1 items-center justify-center overflow-hidden bg-slate-950 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt={image.prompt}
              className="max-h-[calc(100vh-80px)] max-w-full object-contain"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
