'use client';

import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useSessionStore } from '@/store/sessionStore';
import { extractNaiMetadata, ParsedNaiMetadata } from '@/lib/naiMetadata';
import { getImageDimensions } from '@/lib/imageUtils';
import { CharacterPromptEntry, NovelAISampler, NovelAINoiseSchedule } from '@/types/novelai';
import { MetadataModal } from './MetadataModal';

interface PendingDrop {
  file: File;
  metadata: ParsedNaiMetadata | null;
}

export function DropZone() {
  const [dragDepth, setDragDepth] = useState(0);
  const [pending, setPending] = useState<PendingDrop | null>(null);
  const [showFullMetadata, setShowFullMetadata] = useState(false);
  const form = useSettingsStore();
  const { setImg2imgSource } = useSessionStore();

  useEffect(() => {
    const isFileDrag = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes('Files');

    const onDragEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setDragDepth((d) => d + 1);
    };
    const onDragOver = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setDragDepth((d) => Math.max(0, d - 1));
    };
    const onDrop = async (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setDragDepth(0);

      const file = e.dataTransfer?.files[0];
      if (!file || !file.type.startsWith('image/')) return;

      const buffer = await file.arrayBuffer();
      const metadata = extractNaiMetadata(buffer);

      if (metadata) {
        setPending({ file, metadata });
      } else {
        await useAsBase(file);
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function useAsBase(file: File) {
    const blob = file.slice(0, file.size, file.type || 'image/png');
    const { width, height } = await getImageDimensions(blob);
    const url = URL.createObjectURL(blob);
    setImg2imgSource({ blob, url, width, height });
  }

  function importPrompt(metadata: ParsedNaiMetadata) {
    const selected = form.basePrompts.find((p) => p.selected);
    if (selected) {
      form.set(
        'basePrompts',
        form.basePrompts.map((p) => (p.id === selected.id ? { ...p, text: metadata.prompt } : p)),
      );
    }
    form.set('negativePrompt', metadata.negativePrompt);
    form.set('seed', metadata.seed);
    form.set('steps', metadata.steps);
    form.set('scale', metadata.scale);
    form.set('width', metadata.width);
    form.set('height', metadata.height);
    form.set('smea', metadata.smea);
    form.set('smeaDyn', metadata.smeaDyn);
    form.set('cfgRescale', metadata.cfgRescale);
    if (metadata.sampler) form.set('sampler', metadata.sampler as NovelAISampler);
    if (metadata.noiseSchedule) form.set('noiseSchedule', metadata.noiseSchedule as NovelAINoiseSchedule);
    if (metadata.guessedModel) form.set('model', metadata.guessedModel);
    if (metadata.characters.length > 0) {
      const imported: CharacterPromptEntry[] = metadata.characters.map((c) => ({
        id: crypto.randomUUID(),
        prompt: c.prompt,
        uc: '',
        center: c.center,
        enabled: true,
      }));
      form.set('characters', imported);
    }
    setPending(null);
  }

  return (
    <>
      {/* Full-window drop hint overlay */}
      {dragDepth > 0 && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center border-4 border-dashed border-violet-500 bg-slate-950/70">
          <p className="rounded-lg bg-slate-900 px-6 py-4 text-lg font-semibold text-violet-300 shadow-xl">
            Drop image — imports NAI metadata, or use as Img2Img base
          </p>
        </div>
      )}

      {/* Post-drop choice modal, only when the dropped PNG has NAI metadata */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div>
              <h2 className="text-sm font-bold text-slate-100">NAI metadata found</h2>
              <p className="mt-1 text-xs text-slate-400 line-clamp-3" title={pending.metadata!.prompt}>
                {pending.metadata!.prompt}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Seed {pending.metadata!.seed} · {pending.metadata!.width}×{pending.metadata!.height} · {pending.metadata!.steps} steps
                {pending.metadata!.characters.length > 0 && ` · ${pending.metadata!.characters.length} character(s)`}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => importPrompt(pending.metadata!)}
                className="rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
              >
                Import Prompt &amp; Settings
              </button>
              <button
                type="button"
                onClick={async () => { await useAsBase(pending.file); setPending(null); }}
                className="rounded-lg bg-slate-700 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-600"
              >
                Use as Img2Img Base Instead
              </button>
              <button
                type="button"
                onClick={() => setShowFullMetadata(true)}
                className="rounded-lg bg-slate-700 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-600"
              >
                View Full Metadata
              </button>
              <button
                type="button"
                onClick={() => setPending(null)}
                className="py-1 text-xs text-slate-500 transition-colors hover:text-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showFullMetadata && pending && (
        <MetadataModal image={{ blob: pending.file }} onClose={() => setShowFullMetadata(false)} />
      )}
    </>
  );
}
