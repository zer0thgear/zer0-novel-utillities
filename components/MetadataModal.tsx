'use client';

import { useEffect, useState } from 'react';
import { ParsedNaiMetadata, readNaiMetadata } from '@/lib/naiMetadata';

interface MetadataModalProps {
  /** Only `.blob` is read — accepts a GeneratedImage or any raw File/Blob,
   *  so this also works for a dropped image not yet in the session. */
  image: { blob: Blob };
  onClose: () => void;
}

// NovelAI's own labels for a Comment's request_type (its metadata inspector).
const REQUEST_TYPES: Record<string, string> = {
  PromptGenerateRequest: 'Text to Image',
  Img2ImgRequest: 'Image to Image',
  NativeInfillingRequest: 'Inpainting',
};

function requestType(comment: string | undefined): string | null {
  try {
    const type = comment ? (JSON.parse(comment) as { request_type?: unknown }).request_type : undefined;
    return typeof type === 'string' ? (REQUEST_TYPES[type] ?? type) : null;
  } catch {
    return null;
  }
}

const rowCls = 'flex items-start justify-between gap-4 border-b border-slate-800 py-2 text-xs';

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={rowCls}>
      <span className="flex-shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 flex-1 text-right text-slate-200 break-words">{value}</span>
    </div>
  );
}

/** The text chunk is "Generation_time"; the alpha-channel copy says "Generation time". */
function generationTime(raw: Record<string, string>): string {
  const seconds = Number(raw.Generation_time ?? raw['Generation time']);
  return Number.isFinite(seconds) && seconds > 0 ? `${seconds.toFixed(2)}s` : '—';
}

export function MetadataModal({ image, onClose }: MetadataModalProps) {
  const [parsed, setParsed] = useState<ParsedNaiMetadata | null>(null);
  const [raw, setRaw] = useState<Record<string, string> | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Text chunks, or the alpha-channel copy when those were stripped.
    readNaiMetadata(image.blob).then(({ parsed, raw }) => {
      if (cancelled) return;
      setParsed(parsed);
      setRaw(raw);
    });
    return () => { cancelled = true; };
  }, [image]);

  const copyRawJson = () => {
    if (!raw?.Comment) return;
    navigator.clipboard.writeText(raw.Comment).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-800 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-100">Image Metadata</h2>
          <button type="button" onClick={onClose} className="text-slate-500 transition-colors hover:text-slate-300">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {!raw ? (
            <p className="py-8 text-center text-xs text-slate-500">Reading…</p>
          ) : !parsed ? (
            <p className="py-8 text-center text-xs text-slate-500">
              No NovelAI metadata found in this image (not made by NovelAI, or it was stripped).
            </p>
          ) : (
            <>
              {/* Structured view */}
              <div className="flex flex-col">
                {requestType(raw.Comment) && <Row label="Request Type" value={requestType(raw.Comment)!} />}
                {parsed.img2img && (
                  <Row label="Img2Img" value={`strength ${parsed.img2img.strength}, noise ${parsed.img2img.noise}`} />
                )}
                <Row label="Prompt" value={parsed.prompt} />
                <Row label="Negative Prompt" value={parsed.negativePrompt || '(none)'} />
                {parsed.characters.map((c, i) => (
                  <Row key={i} label={`Character ${i + 1}`} value={c.prompt} />
                ))}
                <Row label="Seed" value={parsed.seed} />
                <Row label="Size" value={`${parsed.width}×${parsed.height}`} />
                <Row label="Steps" value={parsed.steps} />
                <Row label="CFG Scale" value={parsed.scale} />
                {parsed.sampler && <Row label="Sampler" value={parsed.sampler} />}
                {parsed.noiseSchedule && <Row label="Noise Schedule" value={parsed.noiseSchedule} />}
                {(parsed.smea || parsed.smeaDyn) && (
                  <Row label="SMEA" value={parsed.smeaDyn ? 'SMEA DYN' : 'SMEA'} />
                )}
                <Row label="CFG Rescale" value={parsed.cfgRescale} />
                <Row label="Source" value={raw.Source ?? '—'} />
                <Row label="Generation Time" value={generationTime(raw)} />
              </div>

              {/* Raw JSON toggle */}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowRaw((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-slate-300"
                >
                  <span>{showRaw ? '▾' : '▸'}</span> Raw Comment JSON
                </button>
                {showRaw && (
                  <div className="mt-2">
                    <textarea
                      readOnly
                      value={raw.Comment ?? ''}
                      rows={10}
                      className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-[10px] text-slate-400 outline-none"
                    />
                    <button
                      type="button"
                      onClick={copyRawJson}
                      className="mt-2 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-600"
                    >
                      {copied ? 'Copied!' : 'Copy JSON'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
