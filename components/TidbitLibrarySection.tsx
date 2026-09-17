'use client';

import { useState } from 'react';
import { LibraryTidbit, NovelAIModel } from '@/types/novelai';
import { useSettingsStore } from '@/store/settingsStore';
import { useSessionStore } from '@/store/sessionStore';
import { TagAutocompleteField } from '@/components/TagAutocompleteField';

interface Props {
  model: NovelAIModel;
}

/** Manages the shared tidbit library. Entries are linked into prompts rather
 *  than copied, so editing one here updates every prompt using it. */
export function TidbitLibrarySection({ model }: Props) {
  const library = useSettingsStore((s) => s.tidbitLibrary);
  const setSetting = useSettingsStore((s) => s.set);
  const apiKey = useSessionStore((s) => s.apiKey);
  const [open, setOpen] = useState(false);

  function update(id: string, changes: Partial<LibraryTidbit>) {
    setSetting('tidbitLibrary', library.map((l) => (l.id === id ? { ...l, ...changes } : l)));
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-700/40 bg-slate-800/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <span className="flex-shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Tidbit Library
          {library.length > 0 && (
            <span className="ml-1.5 normal-case font-normal text-violet-400">
              ({library.length})
            </span>
          )}
        </span>
        <span className="flex-shrink-0 text-xs text-slate-500">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-slate-700/40 p-3">
          <p className="text-xs text-slate-600">
            Reusable snippets. Insert them into any prompt with “+ From Library”; editing one
            here updates every prompt linked to it.
          </p>

          {library.map((entry) => (
            <div key={entry.id} className="flex items-center gap-1.5">
              <input
                type="text"
                value={entry.label}
                onChange={(e) => update(entry.id, { label: e.target.value })}
                placeholder="Label"
                className="w-20 flex-shrink-0 rounded bg-slate-700/60 px-1.5 py-1 text-xs text-slate-300 outline-none border border-transparent focus:border-violet-500/60 transition-colors"
              />
              <TagAutocompleteField
                as="input"
                value={entry.text}
                onChange={(text) => update(entry.id, { text })}
                model={model}
                apiKey={apiKey}
                placeholder="artist:name, ..."
                wrapperClassName="relative min-w-0 flex-1"
                className="w-full rounded bg-slate-900/50 px-2 py-1 text-xs text-slate-100 outline-none border border-slate-700/40 focus:border-violet-500 transition-colors"
              />
              <button
                type="button"
                onClick={() =>
                  setSetting('tidbitLibrary', library.filter((l) => l.id !== entry.id))
                }
                title="Delete from library — prompts using it keep their own copy of the text"
                className="flex-shrink-0 text-xs text-slate-600 hover:text-red-400 transition-colors"
              >
                ✕
              </button>
            </div>
          ))}

          {library.length === 0 && (
            <p className="text-xs italic text-slate-600">
              Nothing saved yet — add one here, or hit ★ on any tidbit to save it.
            </p>
          )}

          <button
            type="button"
            onClick={() =>
              setSetting('tidbitLibrary', [
                ...library,
                { id: crypto.randomUUID(), label: `Tidbit ${library.length + 1}`, text: '' },
              ])
            }
            className="flex items-center gap-1 self-start text-xs text-slate-600 hover:text-violet-400 transition-colors"
          >
            <span>+</span> Add Library Tidbit
          </button>
        </div>
      )}
    </div>
  );
}
