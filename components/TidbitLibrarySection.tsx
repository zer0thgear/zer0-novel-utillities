'use client';

import { useState } from 'react';
import { LibraryTidbit, NovelAIModel } from '@/types/novelai';
import { useSettingsStore } from '@/store/settingsStore';
import { useSessionStore } from '@/store/sessionStore';
import { TagAutocompleteField } from '@/components/TagAutocompleteField';
import { isRandomEntry, randomOptions } from '@/lib/wildcards';

interface Props {
  model: NovelAIModel;
}

const fieldCls =
  'w-full rounded bg-slate-900/50 px-2 py-1 text-xs text-slate-100 outline-none border border-slate-700/40 focus:border-violet-500 transition-colors';

/** Manages the shared tidbit library. Entries are linked into prompts rather
 *  than copied, so editing one here updates every prompt using it. Random
 *  entries are wildcards: one line is picked per image. */
export function TidbitLibrarySection({ model }: Props) {
  const library = useSettingsStore((s) => s.tidbitLibrary);
  const setSetting = useSettingsStore((s) => s.set);
  const apiKey = useSessionStore((s) => s.apiKey);
  const [open, setOpen] = useState(false);

  function update(id: string, changes: Partial<LibraryTidbit>) {
    setSetting('tidbitLibrary', library.map((l) => (l.id === id ? { ...l, ...changes } : l)));
  }

  function setKind(entry: LibraryTidbit, random: boolean) {
    // A fixed entry's text becomes a random entry's first option as-is. Going
    // the other way, options are joined rather than dropped, so nothing is lost.
    update(entry.id, random
      ? { kind: 'random' }
      : { kind: 'fixed', text: randomOptions(entry).join(', ') });
  }

  // Inline `__Label__` references resolve to the first entry with a label, so
  // duplicates make the later ones unreachable that way.
  const labelCounts = new Map<string, number>();
  for (const l of library) {
    const key = l.label.trim().toLowerCase();
    if (key) labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
  }
  const isDuplicate = (l: LibraryTidbit) => (labelCounts.get(l.label.trim().toLowerCase()) ?? 0) > 1;

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
            Reusable snippets. Insert them with “+ From Library”, or write{' '}
            <code className="text-slate-400">__Label__</code> anywhere in a prompt. Editing one
            here updates everywhere it&apos;s used. <span className="text-slate-400">Random</span>{' '}
            entries pick one line per image.
          </p>

          {library.map((entry) => {
            const random = isRandomEntry(entry);
            const duplicate = isDuplicate(entry);
            const optionCount = random ? randomOptions(entry).length : 0;

            return (
              <div key={entry.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={entry.label}
                    onChange={(e) => update(entry.id, { label: e.target.value })}
                    placeholder="Label"
                    title={
                      duplicate
                        ? 'Another entry has this label — __Label__ references use the first one'
                        : `Reference inline as __${entry.label.trim() || 'Label'}__`
                    }
                    className={`min-w-0 flex-1 rounded bg-slate-700/60 px-1.5 py-1 text-xs text-slate-300 outline-none border transition-colors focus:border-violet-500/60 ${
                      duplicate ? 'border-amber-500/70' : 'border-transparent'
                    }`}
                  />
                  <div className="flex flex-shrink-0 overflow-hidden rounded border border-slate-700 text-[10px]">
                    {(['Fixed', 'Random'] as const).map((kind) => {
                      const active = (kind === 'Random') === random;
                      return (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => !active && setKind(entry, kind === 'Random')}
                          title={kind === 'Random' ? 'Pick one line per image' : 'Always the same text'}
                          className={`px-1.5 py-0.5 transition-colors ${
                            active ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          {kind}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSetting('tidbitLibrary', library.filter((l) => l.id !== entry.id))}
                    title="Delete from library — prompts using it keep their own copy of the text"
                    className="flex-shrink-0 text-xs text-slate-600 hover:text-red-400 transition-colors"
                  >
                    ✕
                  </button>
                </div>

                {random ? (
                  <>
                    <TagAutocompleteField
                      as="textarea"
                      rows={Math.min(8, Math.max(3, entry.text.split('\n').length + 1))}
                      value={entry.text}
                      onChange={(text) => update(entry.id, { text })}
                      model={model}
                      apiKey={apiKey}
                      placeholder={'blue hair, long hair\nsilver hair, twintails\n...'}
                      className={`${fieldCls} resize-y`}
                    />
                    <p className="text-[10px] text-slate-600">
                      One option per line · {optionCount} option{optionCount === 1 ? '' : 's'}
                    </p>
                  </>
                ) : (
                  <TagAutocompleteField
                    as="input"
                    value={entry.text}
                    onChange={(text) => update(entry.id, { text })}
                    model={model}
                    apiKey={apiKey}
                    placeholder="artist:name, ..."
                    className={fieldCls}
                  />
                )}
              </div>
            );
          })}

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
                { id: crypto.randomUUID(), label: `Tidbit ${library.length + 1}`, text: '', kind: 'fixed' },
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
