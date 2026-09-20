'use client';

import { useEffect, useState } from 'react';
import { NovelAIGenerateRequest } from '@/types/novelai';
import { redactRequest } from '@/lib/redactRequest';

interface Props {
  /** Builds the request exactly as Generate would, ready to send. */
  build: () => Promise<NovelAIGenerateRequest>;
  onClose: () => void;
}

/**
 * The exact JSON the next Generate would POST, after every step that shapes
 * it: quality tags, wildcards, V5's text section, the size rounding. Useful
 * for comparing against what novelai.net sends, which is how most of this
 * app's behaviour was worked out in the first place.
 */
export function RequestInspectorModal({ build, onClose }: Props) {
  const [json, setJson] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    build()
      .then((request) => live && setJson(JSON.stringify(redactRequest(request), null, 2)))
      .catch((err) => live && setError(err instanceof Error ? err.message : 'Could not build the request.'));
    return () => {
      live = false;
    };
  }, [build]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function copy() {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy to the clipboard.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-full w-full max-w-2xl flex-col gap-3 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <div className="flex flex-shrink-0 items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-100">The request this would send</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Exactly what Generate would POST to NovelAI, with the image data shortened. Wildcards were rolled for
              this preview, and a seed of 0 shows the random one it drew, so a real generation will differ there.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 text-slate-500 transition-colors hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {error && <p className="flex-shrink-0 text-xs text-red-300">{error}</p>}

        <pre className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-300">
          {json ?? (error ? '' : 'Building…')}
        </pre>

        <div className="flex flex-shrink-0 justify-end gap-2">
          <button
            type="button"
            onClick={copy}
            disabled={!json}
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-600 disabled:opacity-50"
          >
            {copied ? 'Copied!' : 'Copy JSON'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
