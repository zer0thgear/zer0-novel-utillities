import { LibraryTidbit, NovelAISampler, SweepAxisInfo } from '@/types/novelai';
import { SAMPLERS } from '@/lib/samplers';

// X/Y parameter sweeps: one image per combination of values, everything else
// held constant (including the seed, unless it's an axis), so differences in
// the grid come from the swept parameter.

export type SweepAxisKind = 'cfg' | 'steps' | 'sampler' | 'seed' | 'wildcard';

/** One axis. `values` are raw strings for every kind: numbers as typed,
 *  sampler ids, or a wildcard entry's options. */
export interface SweepAxis {
  kind: SweepAxisKind;
  values: string[];
  /** The library entry being stepped through, for a wildcard axis. */
  entryId?: string;
}

/** What one grid cell overrides relative to the current form. */
export interface SweepCell {
  xIndex: number;
  yIndex?: number;
  scale?: number;
  steps?: number;
  sampler?: NovelAISampler;
  seed?: number;
  /** Random library entries pinned to one option (see resolveRequestPrompts). */
  force: Record<string, string>;
}

/** Sweeps queue one request per cell, so this caps a run at a size that's
 *  still sensible to confirm and wait for. */
export const MAX_SWEEP_CELLS = 64;

export const NUMERIC_LIMITS: Record<'cfg' | 'steps' | 'seed', { integer: boolean; min: number; max: number }> = {
  cfg: { integer: false, min: 0, max: 10 },
  steps: { integer: true, min: 1, max: 50 },
  seed: { integer: true, min: 0, max: 4294967295 },
};

export function axisInfo(axis: SweepAxis, library: LibraryTidbit[]): SweepAxisInfo {
  const names: Record<SweepAxisKind, string> = {
    cfg: 'CFG',
    steps: 'Steps',
    sampler: 'Sampler',
    seed: 'Seed',
    wildcard: library.find((l) => l.id === axis.entryId)?.label.trim() || 'Wildcard',
  };
  const label = (v: string) =>
    axis.kind === 'sampler' ? SAMPLERS.find((s) => s.value === v)?.label ?? v : v;
  return { name: names[axis.kind], values: axis.values.map(label) };
}

function apply(cell: SweepCell, axis: SweepAxis, value: string) {
  switch (axis.kind) {
    case 'cfg': cell.scale = Number(value); break;
    case 'steps': cell.steps = Number(value); break;
    case 'sampler': cell.sampler = value as NovelAISampler; break;
    case 'seed': cell.seed = Number(value); break;
    case 'wildcard': if (axis.entryId) cell.force[axis.entryId] = value; break;
  }
}

/** Every cell, row by row (Y outer, X inner) — also the order they run in. */
export function sweepCells(x: SweepAxis, y?: SweepAxis): SweepCell[] {
  const cells: SweepCell[] = [];
  for (let yi = 0; yi < (y ? y.values.length : 1); yi++) {
    for (let xi = 0; xi < x.values.length; xi++) {
      const cell: SweepCell = { xIndex: xi, yIndex: y ? yi : undefined, force: {} };
      apply(cell, x, x.values[xi]);
      if (y) apply(cell, y, y.values[yi]);
      cells.push(cell);
    }
  }
  return cells;
}

/** Parses a comma- or space-separated number list, deduplicated, keeping
 *  the tokens that didn't parse (or were out of range) for display. */
export function parseNumberList(
  text: string,
  { integer, min, max }: { integer: boolean; min: number; max: number },
): { values: string[]; invalid: string[] } {
  const values: string[] = [];
  const invalid: string[] = [];
  for (const token of text.split(/[\s,]+/).filter(Boolean)) {
    const n = Number(token);
    if (Number.isFinite(n) && n >= min && n <= max && (!integer || Number.isInteger(n))) {
      if (!values.includes(String(n))) values.push(String(n));
    } else {
      invalid.push(token);
    }
  }
  return { values, invalid };
}
