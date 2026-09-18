'use client';

import { useEffect, useState } from 'react';
import { useSessionStore } from '@/store/sessionStore';
import { extractNaiMetadata, ParsedNaiMetadata } from '@/lib/naiMetadata';
import { getImageDimensions } from '@/lib/imageUtils';
import { MetadataModal } from './MetadataModal';
import { ImportModal } from './ImportModal';

interface PendingImage {
  file: File;
  previewUrl: string;
  metadata: ParsedNaiMetadata | null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

/** Drag-and-drop and clipboard paste of external images. Nothing is applied
 *  until the user picks an action in the confirmation modal. */
export function DropZone() {
  const [dragDepth, setDragDepth] = useState(0);
  const [pending, setPending] = useState<PendingImage | null>(null);
  const [showFullMetadata, setShowFullMetadata] = useState(false);
  const { setImg2imgSource } = useSessionStore();

  useEffect(() => {
    async function receive(file: File) {
      const metadata = extractNaiMetadata(await file.arrayBuffer());
      setPending((prev) => {
        if (prev) URL.revokeObjectURL(prev.previewUrl);
        return { file, previewUrl: URL.createObjectURL(file), metadata };
      });
    }

    const isFileDrag = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

    const onDragEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setDragDepth((d) => d + 1);
    };
    const onDragOver = (e: DragEvent) => {
      if (isFileDrag(e)) e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setDragDepth((d) => Math.max(0, d - 1));
    };
    const onDrop = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setDragDepth(0);
      const file = e.dataTransfer?.files[0];
      if (file?.type.startsWith('image/')) receive(file);
    };

    const onPaste = (e: ClipboardEvent) => {
      const data = e.clipboardData;
      const file = Array.from(data?.files ?? []).find((f) => f.type.startsWith('image/'));
      if (!file) return;
      // Rich-text copies (e.g. from Word) carry an image rendition alongside
      // the text; pasting those into a prompt box should stay a text paste.
      if (isEditableTarget(e.target) && data?.types.includes('text/plain')) return;
      e.preventDefault();
      receive(file);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', onPaste);
    };
  }, []);

  function close() {
    if (pending) URL.revokeObjectURL(pending.previewUrl);
    setPending(null);
    setShowFullMetadata(false);
  }

  async function applyAsBase(file: File) {
    const blob = file.slice(0, file.size, file.type || 'image/png');
    const { width, height } = await getImageDimensions(blob);
    setImg2imgSource({ blob, url: URL.createObjectURL(blob), width, height });
    close();
  }

  return (
    <>
      {dragDepth > 0 && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center border-4 border-dashed border-violet-500 bg-slate-950/70">
          <p className="rounded-lg bg-slate-900 px-6 py-4 text-lg font-semibold text-violet-300 shadow-xl">
            Drop image to import
          </p>
        </div>
      )}

      {pending && (
        <ImportModal
          // A fresh modal (and fresh checkbox defaults) per incoming image.
          key={pending.previewUrl}
          title="What do you want to do with this image?"
          importHeading="This image has NovelAI metadata — import it instead?"
          previewUrl={pending.previewUrl}
          metadata={pending.metadata}
          onUseAsBase={() => applyAsBase(pending.file)}
          onViewMetadata={() => setShowFullMetadata(true)}
          escapeDisabled={showFullMetadata}
          onClose={close}
        />
      )}

      {showFullMetadata && pending && (
        <MetadataModal image={{ blob: pending.file }} onClose={() => setShowFullMetadata(false)} />
      )}
    </>
  );
}
