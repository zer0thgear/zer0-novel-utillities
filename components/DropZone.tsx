'use client';

import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useSessionStore } from '@/store/sessionStore';
import { extractNaiMetadata, ParsedNaiMetadata } from '@/lib/naiMetadata';
import { getImageDimensions } from '@/lib/imageUtils';
import { CharacterPromptEntry, NovelAISampler, NovelAINoiseSchedule } from '@/types/novelai';
import { MetadataModal } from './MetadataModal';

interface PendingImage {
  file: File;
  previewUrl: string;
  metadata: ParsedNaiMetadata | null;
}

// Mirrors NovelAI's own import dialog (checked live 2026-09-18): prompt, UC and
// characters on by default; settings, seed, append and clean imports off.
// appendPrompt is ours — NovelAI has a single prompt, but we have a list.
const DEFAULT_IMPORT = {
  prompt: true,
  appendPrompt: false,
  uc: true,
  characters: true,
  appendCharacters: false,
  settings: false,
  seed: false,
  clean: false,
};
type ImportOptions = typeof DEFAULT_IMPORT;

/** NovelAI's "Clean Imports": strip {} / [] emphasis and space out commas. */
function cleanText(text: string): string {
  return text.replace(/[[\]{}]/g, '').replace(/,\s*/g, ', ').trim();
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
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_IMPORT);
  const [showFullMetadata, setShowFullMetadata] = useState(false);
  const form = useSettingsStore();
  const { setImg2imgSource } = useSessionStore();

  useEffect(() => {
    async function receive(file: File) {
      const metadata = extractNaiMetadata(await file.arrayBuffer());
      setOptions(DEFAULT_IMPORT);
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

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showFullMetadata) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, showFullMetadata]);

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

  function importMetadata(metadata: ParsedNaiMetadata) {
    const tidy = (text: string) => (options.clean ? cleanText(text) : text);

    if (options.prompt && options.appendPrompt) {
      // Add as a new base prompt and select it, since importing implies you
      // want to use it. Single mode allows one selection; Batch adds to it.
      const imported = { id: crypto.randomUUID(), label: 'Imported', text: tidy(metadata.prompt), selected: true };
      const existing =
        form.promptMode === 'single' ? form.basePrompts.map((p) => ({ ...p, selected: false })) : form.basePrompts;
      form.set('basePrompts', [...existing, imported]);
    } else if (options.prompt) {
      const target = form.basePrompts.find((p) => p.selected) ?? form.basePrompts[0];
      if (target) {
        // Tidbits are a UI-only split of the prompt; an imported prompt is
        // already the full composed text, so any tidbits left on the target
        // would be appended a second time. Replace the prompt wholesale.
        form.set(
          'basePrompts',
          form.basePrompts.map((p) =>
            p.id === target.id ? { ...p, text: tidy(metadata.prompt), tidbits: [] } : p,
          ),
        );
      }
    }
    if (options.uc) form.set('negativePrompt', tidy(metadata.negativePrompt));
    if (options.characters && metadata.characters.length > 0) {
      const imported: CharacterPromptEntry[] = metadata.characters.map((c) => ({
        id: crypto.randomUUID(),
        prompt: tidy(c.prompt),
        uc: tidy(c.uc),
        center: c.center,
        enabled: true,
      }));
      form.set('characters', options.appendCharacters ? [...form.characters, ...imported] : imported);
    }
    if (options.settings) {
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
    }
    if (options.seed) form.set('seed', metadata.seed);
    close();
  }

  const meta = pending?.metadata;
  const anySelected = options.prompt || options.uc || options.characters || options.settings || options.seed;

  const checkbox = (key: keyof ImportOptions, label: string, hint?: string, indent = false) => (
    <label className={`flex cursor-pointer items-start gap-2 text-xs ${indent ? 'ml-5' : ''}`}>
      <input
        type="checkbox"
        checked={options[key]}
        disabled={(key === 'appendCharacters' && !options.characters) || (key === 'appendPrompt' && !options.prompt)}
        onChange={(e) => setOptions((o) => ({ ...o, [key]: e.target.checked }))}
        className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 accent-violet-500 disabled:opacity-40"
      />
      <span className="text-slate-300">
        {label}
        {hint && <span className="ml-1 text-slate-600">{hint}</span>}
      </span>
    </label>
  );

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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => e.target === e.currentTarget && close()}
        >
          <div className="flex max-h-full w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-100">What do you want to do with this image?</h2>
              <button
                type="button"
                onClick={close}
                title="Cancel"
                className="flex-shrink-0 text-slate-500 transition-colors hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <img
              src={pending.previewUrl}
              alt=""
              className="max-h-48 w-full rounded-lg bg-slate-950 object-contain"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => applyAsBase(pending.file)}
                className="flex-1 rounded-lg bg-slate-700 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-600"
              >
                Use as Img2Img Base
              </button>
              {meta && (
                <button
                  type="button"
                  onClick={() => setShowFullMetadata(true)}
                  className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-600"
                >
                  View Metadata
                </button>
              )}
            </div>

            {meta && (
              <div className="flex flex-col gap-3 border-t border-slate-800 pt-4">
                <div>
                  <p className="text-xs font-semibold text-slate-200">
                    This image has NovelAI metadata — import it instead?
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Seed {meta.seed} · {meta.width}×{meta.height} · {meta.steps} steps
                    {meta.characters.length > 0 && ` · ${meta.characters.length} character(s)`}
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  {checkbox(
                    'prompt',
                    'Prompt',
                    options.appendPrompt
                      ? '(added as a new base prompt)'
                      : '(replaces the selected base prompt and its tidbits)',
                  )}
                  {checkbox('appendPrompt', 'Append', '(keep existing prompts)', true)}
                  {checkbox('uc', 'Undesired Content')}
                  {checkbox('characters', 'Characters')}
                  {checkbox('appendCharacters', 'Append', '(keep existing characters)', true)}
                  {checkbox('settings', 'Settings', '(model, size, steps, sampler, CFG)')}
                  {checkbox('seed', 'Seed')}
                  <div className="mt-1 border-t border-slate-800 pt-2">
                    {checkbox('clean', 'Clean Imports', '(remove [] / {}, add spaces after commas)')}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => importMetadata(meta)}
                  disabled={!anySelected}
                  className="rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Import Metadata
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showFullMetadata && pending && (
        <MetadataModal image={{ blob: pending.file }} onClose={() => setShowFullMetadata(false)} />
      )}
    </>
  );
}
