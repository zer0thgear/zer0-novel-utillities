'use client';

import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { NOT_REPRODUCIBLE_TEXT, ParsedNaiMetadata } from '@/lib/naiMetadata';
import { CharacterPromptEntry, NovelAINoiseSchedule, NovelAISampler } from '@/types/novelai';

// Mirrors NovelAI's own import dialog (checked live 2026-09-18): prompt, UC and
// characters on by default; settings, seed, append and clean imports off.
// appendPrompt is ours — NovelAI has a single prompt, but we have a list.
export const DEFAULT_IMPORT = {
  prompt: true,
  appendPrompt: false,
  uc: true,
  characters: true,
  appendCharacters: false,
  settings: false,
  seed: false,
  clean: false,
};
export type ImportOptions = typeof DEFAULT_IMPORT;

/** NovelAI's "Clean Imports": strip {} / [] emphasis and space out commas. */
function cleanText(text: string): string {
  return text.replace(/[[\]{}]/g, '').replace(/,\s*/g, ', ').trim();
}

interface Props {
  title: string;
  /** Heading above the import checkboxes. */
  importHeading: string;
  previewUrl: string;
  /** Null when the image carries nothing to import (only its actions show). */
  metadata: ParsedNaiMetadata | null;
  defaults?: ImportOptions;
  onUseAsBase?: () => void;
  onViewMetadata?: () => void;
  /** Suppresses Escape while something is stacked on top (e.g. metadata view). */
  escapeDisabled?: boolean;
  onClose: () => void;
}

/** "What do you want to do with this image?": used for dropped/pasted images
 *  and for reusing a history image. Nothing is applied until a button is hit. */
export function ImportModal({
  title,
  importHeading,
  previewUrl,
  metadata,
  defaults = DEFAULT_IMPORT,
  onUseAsBase,
  onViewMetadata,
  escapeDisabled = false,
  onClose,
}: Props) {
  const form = useSettingsStore();
  const [options, setOptions] = useState<ImportOptions>(defaults);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !escapeDisabled) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [escapeDisabled, onClose]);

  function importMetadata(meta: ParsedNaiMetadata) {
    const tidy = (text: string) => (options.clean ? cleanText(text) : text);

    if (options.prompt && options.appendPrompt) {
      // Add as a new base prompt and select it, since importing implies you
      // want to use it. Single mode allows one selection; Batch adds to it.
      const imported = { id: crypto.randomUUID(), label: 'Imported', text: tidy(meta.prompt), selected: true };
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
          form.basePrompts.map((p) => (p.id === target.id ? { ...p, text: tidy(meta.prompt), tidbits: [] } : p)),
        );
      }
    }
    if (options.uc) form.set('negativePrompt', tidy(meta.negativePrompt));
    if (options.characters && meta.characters.length > 0) {
      const imported: CharacterPromptEntry[] = meta.characters.map((c) => ({
        id: crypto.randomUUID(),
        prompt: tidy(c.prompt),
        uc: tidy(c.uc),
        center: c.center,
        enabled: true,
      }));
      form.set('characters', options.appendCharacters ? [...form.characters, ...imported] : imported);
    }
    if (options.settings) {
      form.set('steps', meta.steps);
      form.set('scale', meta.scale);
      form.set('width', meta.width);
      form.set('height', meta.height);
      form.set('smea', meta.smea);
      form.set('smeaDyn', meta.smeaDyn);
      form.set('cfgRescale', meta.cfgRescale);
      if (meta.sampler) form.set('sampler', meta.sampler as NovelAISampler);
      if (meta.noiseSchedule) form.set('noiseSchedule', meta.noiseSchedule as NovelAINoiseSchedule);
      if (meta.guessedModel) form.set('model', meta.guessedModel);
      // Only this app's own images know these; a dropped PNG leaves them alone.
      if (meta.modifiers) useSettingsStore.setState(meta.modifiers);
    }
    if (options.seed) form.set('seed', meta.seed);
    onClose();
  }

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-full w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            title="Cancel"
            className="flex-shrink-0 text-slate-500 transition-colors hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt="" className="max-h-48 w-full rounded-lg bg-slate-950 object-contain" />

        {(onUseAsBase || (metadata && onViewMetadata)) && (
          <div className="flex gap-2">
            {onUseAsBase && (
              <button
                type="button"
                onClick={onUseAsBase}
                className="flex-1 rounded-lg bg-slate-700 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-600"
              >
                Use as Img2Img Base
              </button>
            )}
            {metadata && onViewMetadata && (
              <button
                type="button"
                onClick={onViewMetadata}
                className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-600"
              >
                View Metadata
              </button>
            )}
          </div>
        )}

        {metadata?.directorTool && (
          <p className="border-t border-slate-800 pt-4 text-xs text-slate-500">
            This is a Director Tools result, so there are no generation settings to import.
          </p>
        )}

        {metadata && !metadata.directorTool && (
          <div className="flex flex-col gap-3 border-t border-slate-800 pt-4">
            <div>
              <p className="text-xs font-semibold text-slate-200">{importHeading}</p>
              <p className="mt-1 text-xs text-slate-600">
                Seed {metadata.seed} · {metadata.width}×{metadata.height} · {metadata.steps} steps
                {metadata.characters.length > 0 && ` · ${metadata.characters.length} character(s)`}
              </p>
              {metadata.notReproducible && (
                <p className="mt-2 text-xs text-amber-400">
                  {NOT_REPRODUCIBLE_TEXT[metadata.notReproducible]}
                  {metadata.img2img &&
                    ` (Strength ${metadata.img2img.strength}, noise ${metadata.img2img.noise}.)`}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              {checkbox(
                'prompt',
                'Prompt',
                options.appendPrompt ? '(added as a new base prompt)' : '(replaces the selected base prompt and its tidbits)',
              )}
              {checkbox('appendPrompt', 'Append', '(keep existing prompts)', true)}
              {checkbox('uc', 'Undesired Content')}
              {checkbox('characters', 'Characters')}
              {checkbox('appendCharacters', 'Append', '(keep existing characters)', true)}
              {checkbox(
                'settings',
                'Settings',
                metadata.modifiers
                  ? '(model, size, steps, sampler, CFG, prompt modifiers)'
                  : '(model, size, steps, sampler, CFG)',
              )}
              {checkbox('seed', 'Seed')}
              <div className="mt-1 border-t border-slate-800 pt-2">
                {checkbox('clean', 'Clean Imports', '(remove [] / {}, add spaces after commas)')}
              </div>
            </div>

            <button
              type="button"
              onClick={() => importMetadata(metadata)}
              disabled={!anySelected}
              className="rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Import Metadata
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
