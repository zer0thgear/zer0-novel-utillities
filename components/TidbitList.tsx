'use client';

import { LibraryTidbit, NovelAIModel, PromptTidbit } from '@/types/novelai';
import { createTidbit, createLinkedTidbit, linkedEntry } from '@/lib/promptTidbits';
import { moveItem, normalizePromptPart } from '@/lib/promptText';
import { useSettingsStore } from '@/store/settingsStore';
import { TagAutocompleteField } from '@/components/TagAutocompleteField';
import { ReorderArrows } from '@/components/ReorderArrows';

interface TidbitListProps {
  tidbits: PromptTidbit[];
  onChange: (tidbits: PromptTidbit[]) => void;
  model: NovelAIModel;
  apiKey: string;
  placeholder: string;
  /** Base and character cards give their label inputs slightly different widths. */
  labelWidthCls?: string;
}

/** The tidbit block shared by base prompts and character prompts: toggleable
 *  sub-prompts, reorderable, each either inline or linked to a shared library
 *  entry (whose text is what actually gets composed — see lib/promptTidbits.ts). */
export function TidbitList({
  tidbits,
  onChange,
  model,
  apiKey,
  placeholder,
  labelWidthCls = 'w-20',
}: TidbitListProps) {
  const library = useSettingsStore((s) => s.tidbitLibrary);
  const setSetting = useSettingsStore((s) => s.set);

  function update(id: string, changes: Partial<PromptTidbit>) {
    onChange(tidbits.map((t) => (t.id === id ? { ...t, ...changes } : t)));
  }

  function saveToLibrary(tidbit: PromptTidbit) {
    const entry: LibraryTidbit = {
      id: crypto.randomUUID(),
      label: tidbit.label,
      text: normalizePromptPart(tidbit.text),
    };
    setSetting('tidbitLibrary', [...library, entry]);
    update(tidbit.id, { sourceId: entry.id });
  }

  /** Keeps the entry's current text as this prompt's own, so unlinking never
   *  silently changes what the prompt generates. */
  function unlink(tidbit: PromptTidbit) {
    const entry = linkedEntry(tidbit, library);
    update(tidbit.id, {
      sourceId: undefined,
      label: entry?.label ?? tidbit.label,
      text: entry?.text ?? tidbit.text,
    });
  }

  const inputCls =
    'rounded bg-slate-700/60 px-1.5 py-1 text-xs outline-none border border-transparent focus:border-violet-500/60 transition-colors';

  return (
    <div className="flex flex-col gap-1.5">
      {tidbits.map((tidbit, index) => {
        const entry = linkedEntry(tidbit, library);

        return (
          <div key={tidbit.id} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={tidbit.enabled}
              onChange={(e) => update(tidbit.id, { enabled: e.target.checked })}
              title={entry ? 'Use this library tidbit in this prompt' : 'Include this tidbit'}
              className="h-3.5 w-3.5 flex-shrink-0 accent-violet-500"
            />

            {entry ? (
              <>
                <span
                  className={`${labelWidthCls} flex-shrink-0 truncate rounded bg-violet-600/15 px-1.5 py-1 text-xs text-violet-300`}
                  title={`Linked to library tidbit "${entry.label}"`}
                >
                  {entry.label || 'Untitled'}
                </span>
                <span
                  className="min-w-0 flex-1 truncate rounded bg-slate-900/30 px-2 py-1 text-xs text-slate-400"
                  title={entry.text}
                >
                  {entry.text || <span className="italic text-slate-600">empty</span>}
                </span>
              </>
            ) : (
              <>
                <input
                  type="text"
                  value={tidbit.label}
                  onChange={(e) => update(tidbit.id, { label: e.target.value })}
                  placeholder="Label"
                  className={`${labelWidthCls} flex-shrink-0 text-slate-300 ${inputCls}`}
                />
                <TagAutocompleteField
                  as="input"
                  value={tidbit.text}
                  onChange={(text) => update(tidbit.id, { text })}
                  model={model}
                  apiKey={apiKey}
                  placeholder={placeholder}
                  wrapperClassName="relative min-w-0 flex-1"
                  className="w-full rounded bg-slate-900/50 px-2 py-1 text-xs text-slate-100 outline-none border border-slate-700/40 focus:border-violet-500 transition-colors"
                />
              </>
            )}

            <button
              type="button"
              onClick={() => (entry ? unlink(tidbit) : saveToLibrary(tidbit))}
              title={
                entry
                  ? 'Linked to the shared library — click to unlink and edit here'
                  : 'Save to the shared library so other prompts can reuse it'
              }
              className={`flex-shrink-0 text-xs leading-none transition-colors ${
                entry ? 'text-violet-400 hover:text-violet-300' : 'text-slate-600 hover:text-violet-400'
              }`}
            >
              ★
            </button>

            <ReorderArrows
              index={index}
              count={tidbits.length}
              onMove={(direction) => onChange(moveItem(tidbits, index, direction))}
              label="tidbit"
            />

            <button
              type="button"
              onClick={() => onChange(tidbits.filter((t) => t.id !== tidbit.id))}
              title="Remove tidbit"
              className="flex-shrink-0 text-xs text-slate-600 hover:text-red-400 transition-colors"
            >
              ✕
            </button>
          </div>
        );
      })}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange([...tidbits, createTidbit(`Tidbit ${tidbits.length + 1}`)])}
          className="flex items-center gap-1 text-xs text-slate-600 hover:text-violet-400 transition-colors"
        >
          <span>+</span> Add Tidbit
        </button>

        {library.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              const entry = library.find((l) => l.id === e.target.value);
              if (entry) onChange([...tidbits, createLinkedTidbit(entry)]);
            }}
            title="Insert a tidbit from the shared library"
            className="min-w-0 max-w-[55%] rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-500 outline-none border border-slate-700/40 hover:text-violet-400 focus:border-violet-500 transition-colors"
          >
            <option value="">+ From Library…</option>
            {library.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label || 'Untitled'}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
