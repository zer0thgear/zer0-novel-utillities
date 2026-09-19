'use client';

import { useEffect, useState } from 'react';
import { LibraryTidbit, NovelAISampler } from '@/types/novelai';
import { SAMPLERS } from '@/lib/samplers';
import { randomOptions } from '@/lib/wildcards';
import { randomSeed } from '@/lib/imageRequest';
import {
  MAX_SWEEP_CELLS,
  NUMERIC_LIMITS,
  NumericAxisKind,
  parseNumberList,
  SweepAxis,
  sweepCells,
} from '@/lib/sweeps';

interface Defaults {
  scale: number;
  cfgRescale: number;
  steps: number;
  sampler: NovelAISampler;
  /** 0 means "random", same as the form's seed field. */
  seed: number;
}

interface Props {
  defaults: Defaults;
  /** Random library entries the current prompts actually use. */
  randomEntries: LibraryTidbit[];
  unknownRefs: string[];
  /** Anlas for one single-image request at a given step count, or null if
   *  the subscription (and so the Opus discount) isn't known yet. */
  costFor: (steps: number) => number | null;
  onRun: (x: SweepAxis, y?: SweepAxis) => void;
  onClose: () => void;
}

/** Editor state for one axis. `key` is a kind, `wildcard:<entryId>`, or
 *  (Y only) `none`; `text` backs the numeric kinds and `picked` the chip kinds. */
interface AxisDraft {
  key: string;
  text: string;
  picked: string[];
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);
// CFG Rescale moves in steps of 0.02.
const fmt2 = (n: number) => String(Math.round(n * 100) / 100);

const isNumericKind = (key: string): key is NumericAxisKind => key in NUMERIC_LIMITS;

function draftFor(key: string, d: Defaults, randomEntries: LibraryTidbit[]): AxisDraft {
  if (key === 'cfg') {
    const vals = [d.scale - 1, d.scale, d.scale + 1].filter((v) => v >= 0 && v <= 10);
    return { key, text: vals.map(fmt).join(', '), picked: [] };
  }
  if (key === 'cfgRescale') {
    // Off, a moderate and a strong rescale, plus the current value.
    const vals = [...new Set([0, 0.3, 0.6, Number(fmt2(d.cfgRescale))])].sort((a, b) => a - b);
    return { key, text: vals.map(fmt2).join(', '), picked: [] };
  }
  if (key === 'steps') {
    return { key, text: [...new Set([Math.max(1, d.steps - 8), d.steps])].join(', '), picked: [] };
  }
  if (key === 'seed') {
    return { key, text: Array.from({ length: 4 }, randomSeed).join(', '), picked: [] };
  }
  if (key === 'sampler') {
    const others = SAMPLERS.map((s) => s.value).filter((v) => v !== d.sampler);
    return { key, text: '', picked: [d.sampler, ...others.slice(0, 2)] };
  }
  if (key.startsWith('wildcard:')) {
    const entry = randomEntries.find((e) => `wildcard:${e.id}` === key);
    return { key, text: '', picked: entry ? randomOptions(entry) : [] };
  }
  return { key: 'none', text: '', picked: [] };
}

/** Turns a draft into an axis, or explains why it can't be used yet. */
function toAxis(draft: AxisDraft): { axis?: SweepAxis; problem?: string } {
  if (draft.key === 'none') return {};
  if (isNumericKind(draft.key)) {
    const { values, invalid } = parseNumberList(draft.text, NUMERIC_LIMITS[draft.key]);
    const { min, max } = NUMERIC_LIMITS[draft.key];
    if (invalid.length) return { problem: `Not valid (${min}–${max}): ${invalid.join(', ')}` };
    if (!values.length) return { problem: 'Enter at least one value' };
    return { axis: { kind: draft.key, values } };
  }
  if (!draft.picked.length) return { problem: 'Pick at least one' };
  if (draft.key === 'sampler') return { axis: { kind: 'sampler', values: draft.picked } };
  return { axis: { kind: 'wildcard', entryId: draft.key.slice('wildcard:'.length), values: draft.picked } };
}

export function SweepModal({ defaults, randomEntries, unknownRefs, costFor, onRun, onClose }: Props) {
  const [x, setX] = useState<AxisDraft>(() => draftFor('cfg', defaults, randomEntries));
  const [y, setY] = useState<AxisDraft>({ key: 'none', text: '', picked: [] });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const xr = toAxis(x);
  const yr = toAxis(y);
  const cells = xr.axis && !yr.problem ? sweepCells(xr.axis, yr.axis) : [];
  const tooMany = cells.length > MAX_SWEEP_CELLS;
  const costs = cells.map((c) => costFor(c.steps ?? defaults.steps));
  const totalCost = costs.every((c) => c !== null) ? costs.reduce<number>((n, c) => n + (c ?? 0), 0) : null;
  const canRun = !!xr.axis && !yr.problem && cells.length > 0 && !tooMany;
  const seedIsAxis = x.key === 'seed' || y.key === 'seed';
  const sweptEntries = [x.key, y.key].filter((k) => k.startsWith('wildcard:')).length;

  const kinds: { key: string; label: string }[] = [
    { key: 'cfg', label: 'CFG scale' },
    { key: 'cfgRescale', label: 'CFG Rescale' },
    { key: 'steps', label: 'Steps' },
    { key: 'sampler', label: 'Sampler' },
    { key: 'seed', label: 'Seed' },
    ...randomEntries.map((e) => ({ key: `wildcard:${e.id}`, label: `⚄ ${e.label.trim() || 'Untitled'}` })),
  ];

  function axisEditor(
    title: string,
    draft: AxisDraft,
    setDraft: (d: AxisDraft) => void,
    other: AxisDraft,
    problem: string | undefined,
    optional: boolean,
  ) {
    const chips =
      draft.key === 'sampler'
        ? SAMPLERS.map((s) => ({ value: s.value as string, label: s.label }))
        : draft.key.startsWith('wildcard:')
          ? (() => {
              const entry = randomEntries.find((e) => `wildcard:${e.id}` === draft.key);
              return (entry ? randomOptions(entry) : []).map((o) => ({ value: o, label: o }));
            })()
          : null;

    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</span>
          <select
            value={draft.key}
            onChange={(e) => setDraft(draftFor(e.target.value, defaults, randomEntries))}
            className="min-w-0 rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 outline-none border border-slate-700 focus:border-violet-500"
          >
            {optional && <option value="none">None</option>}
            {kinds.map((k) => (
              <option key={k.key} value={k.key} disabled={k.key === other.key}>
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
                    setDraft({
                      ...draft,
                      // Keep the chips' own order, whatever order they're toggled in.
                      picked: chips
                        .map((ch) => ch.value)
                        .filter((v) => (v === c.value ? !on : draft.picked.includes(v))),
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
        ) : (
          <div className="flex gap-1.5">
            <input
              type="text"
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              placeholder="Comma-separated values"
              className="min-w-0 flex-1 rounded bg-slate-900/60 px-2 py-1 text-xs text-slate-100 outline-none border border-slate-700 focus:border-violet-500"
            />
            {draft.key === 'seed' && (
              <button
                type="button"
                onClick={() => setDraft({ ...draft, text: Array.from({ length: 4 }, randomSeed).join(', ') })}
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

  const count = cells.length;
  const runLabel =
    `Run ${count} image${count === 1 ? '' : 's'}` +
    (totalCost === null ? '' : totalCost > 0 ? ` — ~${totalCost} Anlas` : ' — Free');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-full w-full max-w-md flex-col gap-4 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-100">X/Y Sweep</h2>
            <p className="mt-1 text-xs text-slate-500">
              One image per combination, everything else held the same, so you can compare the
              effect of each value side by side.
            </p>
          </div>
          <button type="button" onClick={onClose} title="Cancel" className="text-slate-500 hover:text-slate-200">
            ✕
          </button>
        </div>

        {axisEditor('X axis', x, setX, y, xr.problem, false)}
        {axisEditor('Y axis', y, setY, x, yr.problem, true)}

        <div className="flex flex-col gap-1 rounded-lg bg-slate-800/50 px-3 py-2 text-xs text-slate-400">
          <p>
            {yr.axis && xr.axis && `${xr.axis.values.length} × ${yr.axis.values.length} = `}
            <span className="text-slate-200">
              {count} image{count === 1 ? '' : 's'}
            </span>
            , queued one at a time.
          </p>
          {!seedIsAxis && (
            <p>
              {defaults.seed === 0
                ? 'One random seed, shared by every image.'
                : `Seed ${defaults.seed} for every image.`}
            </p>
          )}
          {randomEntries.length > sweptEntries && (
            <p>Other wildcards are rolled once and held the same across the grid.</p>
          )}
          {tooMany && (
            <p className="text-amber-400">That&apos;s more than {MAX_SWEEP_CELLS} images — narrow it down.</p>
          )}
          {unknownRefs.length > 0 && (
            <p className="text-amber-400">
              Unknown wildcard{unknownRefs.length > 1 ? 's' : ''} {unknownRefs.join(', ')} will be sent as
              literal text.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canRun}
            onClick={() => xr.axis && onRun(xr.axis, yr.axis)}
            className="flex-1 rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {runLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
