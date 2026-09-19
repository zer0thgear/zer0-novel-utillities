'use client';

import { useEffect, useState } from 'react';
import { LibraryTidbit } from '@/types/novelai';
import {
  draftFor,
  MAX_SWEEP_CELLS,
  NO_AXIS,
  SweepAxis,
  SweepAxisDraft,
  sweepCells,
  SweepDefaults,
  toAxis,
} from '@/lib/sweeps';
import { SweepAxisEditor } from './SweepAxisEditor';

interface Props {
  defaults: SweepDefaults;
  /** Random library entries the current prompts actually use. */
  randomEntries: LibraryTidbit[];
  unknownRefs: string[];
  /** Anlas for one single-image request at a given step count, or null if
   *  the subscription (and so the Opus discount) isn't known yet. */
  costFor: (steps: number) => number | null;
  onRun: (x: SweepAxis, y?: SweepAxis) => void;
  onClose: () => void;
}

export function SweepModal({ defaults, randomEntries, unknownRefs, costFor, onRun, onClose }: Props) {
  const [x, setX] = useState<SweepAxisDraft>(() => draftFor('cfg', defaults, randomEntries));
  const [y, setY] = useState<SweepAxisDraft>(NO_AXIS);

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

        <SweepAxisEditor
          title="X axis"
          draft={x}
          onChange={setX}
          other={y}
          problem={xr.problem}
          defaults={defaults}
          randomEntries={randomEntries}
        />
        <SweepAxisEditor
          title="Y axis"
          draft={y}
          onChange={setY}
          other={x}
          problem={yr.problem}
          optional
          defaults={defaults}
          randomEntries={randomEntries}
        />

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
