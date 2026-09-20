import { describe, expect, it } from 'vitest';
import { parseSweepPreset, saveSweepPreset, SweepPreset, sweepPresetSummary } from '@/lib/sweepPresets';
import { NO_AXIS, SweepAxisDraft } from '@/lib/sweeps';

const cfg: SweepAxisDraft = { key: 'cfg', text: '4, 5, 6', picked: [] };
const tags: SweepAxisDraft = { key: 'tags', text: 'smile, wink', picked: [], baseline: true };

describe('saveSweepPreset', () => {
  it('saves a new setup', () => {
    const saved = saveSweepPreset([], 'Guidance', cfg, NO_AXIS);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: 'Guidance', x: cfg, y: NO_AXIS });
    expect(saved[0].id).toBeTruthy();
  });

  it('keeps a copy, not a live reference to the editor state', () => {
    const editing = { ...cfg };
    const saved = saveSweepPreset([], 'Guidance', editing, NO_AXIS);
    editing.text = 'changed';
    expect(saved[0].x.text).toBe('4, 5, 6');
  });

  it('updates the one with that name instead of duplicating it', () => {
    const first = saveSweepPreset([], 'Guidance', cfg, NO_AXIS);
    const second = saveSweepPreset(first, '  guidance  ', tags, cfg);
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
    // It keeps the name it was first saved under.
    expect(second[0].name).toBe('Guidance');
    expect(second[0].x).toEqual(tags);
  });

  it('ignores an empty name', () => {
    expect(saveSweepPreset([], '   ', cfg, NO_AXIS)).toEqual([]);
  });
});

describe('sweepPresetSummary', () => {
  const preset = (x: SweepAxisDraft, y: SweepAxisDraft): SweepPreset => ({ id: 'a', name: 'n', x, y });

  it('says what each axis varies and over how many values', () => {
    expect(sweepPresetSummary(preset(cfg, NO_AXIS))).toBe('cfg ×3');
    // The tags axis has its "(none)" baseline on, so that's three values.
    expect(sweepPresetSummary(preset(cfg, tags))).toBe('cfg ×3 × tags ×3');
  });

  it('says so when nothing usable is set', () => {
    expect(sweepPresetSummary(preset(NO_AXIS, NO_AXIS))).toBe('Nothing set');
    expect(sweepPresetSummary(preset({ key: 'cfg', text: '', picked: [] }, NO_AXIS))).toBe('Nothing set');
  });
});

describe('parseSweepPreset (untrusted import)', () => {
  it('reads a well-formed one', () => {
    const parsed = parseSweepPreset({ id: 'a', name: 'Guidance', x: cfg, y: tags });
    expect(parsed).toEqual({ id: 'a', name: 'Guidance', x: cfg, y: tags });
  });

  it('defaults a missing or broken Y axis to none', () => {
    expect(parseSweepPreset({ id: 'a', name: 'n', x: cfg })?.y).toEqual(NO_AXIS);
    expect(parseSweepPreset({ id: 'a', name: 'n', x: cfg, y: { key: 5 } })?.y).toEqual(NO_AXIS);
  });

  it('refuses anything without a usable X axis or a name', () => {
    for (const bad of [null, 42, {}, { id: 'a', name: 'n' }, { id: 'a', x: cfg }, { id: 'a', name: 'n', x: {} }]) {
      expect(parseSweepPreset(bad)).toBeNull();
    }
  });

  it('drops picked entries that are not strings', () => {
    const parsed = parseSweepPreset({ id: 'a', name: 'n', x: { key: 'sampler', text: '', picked: ['a', 7, null] } });
    expect(parsed?.x.picked).toEqual(['a']);
  });
});
