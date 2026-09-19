'use client';

import { LibraryTidbit } from '@/types/novelai';
import { SAMPLERS } from '@/lib/samplers';
import { randomOptions } from '@/lib/wildcards';
import { randomSeed } from '@/lib/imageRequest';
import { AXIS_NAMES, draftFor, parseTagList, SweepAxisDraft, SweepDefaults } from '@/lib/sweeps';

/** The axis kinds offered, plus the random library entries in use. */
export function axisKinds(randomEntries: LibraryTidbit[]): { key: string; label: string }[] {
  return [
    { key: 'cfg', label: 'CFG scale' },
    { key: 'cfgRescale', label: AXIS_NAMES.cfgRescale },
    { key: 'steps', label: AXIS_NAMES.steps },
    { key: 'sampler', label: AXIS_NAMES.sampler },
    { key: 'seed', label: AXIS_NAMES.seed },
    { key: 'tags', label: AXIS_NAMES.tags },
    ...randomEntries.map((e) => ({ key: `wildcard:${e.id}`, label: `⚄ ${e.label.trim() || 'Untitled'}` })),
  ];
}

interface Props {
  title: string;
  draft: SweepAxisDraft;
  onChange: (draft: SweepAxisDraft) => void;
  /** The other axis, whose kind this one can't also use. */
  other: SweepAxisDraft;
  problem?: string;
  /** Offers "None" (the Y axis). */
  optional?: boolean;
  defaults: SweepDefaults;
  randomEntries: LibraryTidbit[];
}

/** One sweep axis: its kind, then its values. Used by the Sweep dialog and by
 *  a chain's Sweep step. */
export function SweepAxisEditor({ title, draft, onChange, other, problem, optional, defaults, randomEntries }: Props) {
  const chips =
    draft.key === 'sampler'
      ? SAMPLERS.map((s) => ({ value: s.value as string, label: s.label }))
      : draft.key.startsWith('wildcard:')
        ? (() => {
            const entry = randomEntries.find((e) => `wildcard:${e.id}` === draft.key);
            return (entry ? randomOptions(entry) : []).map((o) => ({ value: o, label: o }));
          })()
        : null;
  const inputCls =
    'min-w-0 flex-1 rounded bg-slate-900/60 px-2 py-1 text-xs text-slate-100 outline-none border border-slate-700 focus:border-violet-500';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</span>
        <select
          value={draft.key}
          onChange={(e) => onChange(draftFor(e.target.value, defaults, randomEntries))}
          className="min-w-0 rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 outline-none border border-slate-700 focus:border-violet-500"
        >
          {optional && <option value="none">None</option>}
          {axisKinds(randomEntries).map((k) => (
            <option key={k.key} value={k.key} disabled={k.key === other.key && k.key !== 'tags'}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      {draft.key === 'none' ? null : chips ? (
        <div className="flex flex-wrap gap-1">
          {chips.map((c) => {
            const on = draft.picked.includes(c.value);
            return (
              <button
                key={c.value}
                type="button"
                onClick={() =>
                  onChange({
                    ...draft,
                    // Keep the chips' own order, whatever order they're toggled in.
                    picked: chips.map((ch) => ch.value).filter((v) => (v === c.value ? !on : draft.picked.includes(v))),
                  })
                }
                className={`rounded px-2 py-1 text-xs transition-colors ${
                  on ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-500 hover:text-slate-300'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      ) : draft.key === 'tags' ? (
        <div className="flex flex-col gap-1">
          <textarea
            value={draft.text}
            onChange={(e) => onChange({ ...draft, text: e.target.value })}
            rows={2}
            placeholder="smile, {open mouth, teeth}, 1.3::looking at viewer, wink::"
            className={`${inputCls} resize-y`}
          />
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={draft.baseline ?? false}
                onChange={(e) => onChange({ ...draft, baseline: e.target.checked })}
                className="h-3.5 w-3.5 accent-violet-500"
              />
              Include a &quot;(none)&quot; baseline
            </label>
            <span>
              {parseTagList(draft.text).length} value{parseTagList(draft.text).length === 1 ? '' : 's'}
            </span>
          </div>
          <p className="text-[11px] text-slate-600">
            Separate values with commas. A group in {'{}'}, [] or weight::…:: stays one value. Each is added to the
            prompt where quality tags go.
          </p>
        </div>
      ) : (
        <div className="flex gap-1.5">
          <input
            type="text"
            value={draft.text}
            onChange={(e) => onChange({ ...draft, text: e.target.value })}
            placeholder="Comma-separated values"
            className={inputCls}
          />
          {draft.key === 'seed' && (
            <button
              type="button"
              onClick={() => onChange({ ...draft, text: Array.from({ length: 4 }, randomSeed).join(', ') })}
              className="flex-shrink-0 rounded bg-slate-800 px-2 text-xs text-slate-400 hover:text-slate-200"
            >
              Reroll
            </button>
          )}
        </div>
      )}
      {problem && <p className="text-[11px] text-amber-400">{problem}</p>}
    </div>
  );
}
