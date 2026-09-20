import { NO_AXIS, parseAxisDraft, SweepAxisDraft, toAxis } from '@/lib/sweeps';

// Saved sweep setups: a named pair of axes, shared by the Sweep dialog and a
// chain's Sweep step. Setting the same grid up again — a tag list especially —
// is the tedious part of running one twice.

export interface SweepPreset {
  id: string;
  name: string;
  x: SweepAxisDraft;
  y: SweepAxisDraft;
}

/** A one-line description of what a saved setup varies, for the picker. */
export function sweepPresetSummary(preset: SweepPreset): string {
  const name = (draft: SweepAxisDraft) => {
    const { axis } = toAxis(draft);
    if (!axis) return null;
    const what = axis.kind === 'wildcard' ? 'wildcard' : axis.kind;
    return `${what} ×${axis.values.length}`;
  };
  return [name(preset.x), name(preset.y)].filter(Boolean).join(' × ') || 'Nothing set';
}

/**
 * Saves a setup under a name, replacing one that already has it (matched the
 * way the settings presets match theirs, ignoring case and spacing) so saving
 * twice updates rather than duplicates.
 */
export function saveSweepPreset(
  presets: SweepPreset[],
  name: string,
  x: SweepAxisDraft,
  y: SweepAxisDraft,
): SweepPreset[] {
  const trimmed = name.trim();
  if (!trimmed) return presets;
  const key = trimmed.toLowerCase();
  const existing = presets.find((p) => p.name.trim().toLowerCase() === key);
  const saved: SweepPreset = {
    id: existing?.id ?? crypto.randomUUID(),
    // Keep the name it was first saved under, as the settings presets do.
    name: existing?.name ?? trimmed,
    x: structuredClone(x),
    y: structuredClone(y),
  };
  return existing ? presets.map((p) => (p.id === existing.id ? saved : p)) : [...presets, saved];
}

/** A saved setup from an import file, or null if it isn't one. */
export function parseSweepPreset(v: unknown): SweepPreset | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return null;
  const x = parseAxisDraft(o.x);
  if (!x) return null;
  return { id: o.id, name: o.name, x, y: parseAxisDraft(o.y) ?? NO_AXIS };
}
