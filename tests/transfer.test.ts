import { describe, expect, it } from 'vitest';
import { parseTransferFile } from '@/lib/transfer';

// Export files come from the user's disk, so everything in them is untrusted:
// the parser keeps what it recognises and drops the rest rather than trusting
// the file's shape.

const file = (extra: Record<string, unknown>) =>
  JSON.stringify({ app: 'zer0-novel-frontend', version: 1, exportedAt: '2026-09-19', ...extra });

describe('parseTransferFile', () => {
  it('refuses anything that is not one of our exports', () => {
    expect(parseTransferFile('not json').error).toBe("That file isn't valid JSON.");
    expect(parseTransferFile('[]').error).toBe("That isn't an export from this app.");
    expect(parseTransferFile(JSON.stringify({ app: 'something-else', version: 1 })).error).toBe(
      "That isn't an export from this app.",
    );
    expect(parseTransferFile(JSON.stringify({ app: 'zer0-novel-frontend', version: 99 })).error).toContain(
      'Unsupported export version',
    );
  });

  it('accepts a minimal file', () => {
    const { file: parsed, error } = parseTransferFile(file({}));
    expect(error).toBeUndefined();
    expect(parsed?.basePrompts).toBeUndefined();
  });

  it('drops list items missing what they need', () => {
    const { file: parsed } = parseTransferFile(
      file({ basePrompts: [{ id: 'a', text: 'x' }, { id: 'b' }, 'nope', null] }),
    );
    expect(parsed?.basePrompts).toHaveLength(1);
    expect(parsed?.basePrompts?.[0]).toMatchObject({ id: 'a', text: 'x', label: 'Imported', selected: false });
  });

  it('clamps a character’s position into the canvas', () => {
    const { file: parsed } = parseTransferFile(
      file({ characters: [{ id: 'c', prompt: '1girl', center: { x: 5, y: -3 } }] }),
    );
    expect(parsed?.characters?.[0].center).toEqual({ x: 1, y: 0 });
  });

  it('falls back to the middle when the position is nonsense', () => {
    const { file: parsed } = parseTransferFile(
      file({ characters: [{ id: 'c', prompt: '1girl', center: { x: 'left', y: null } }] }),
    );
    expect(parsed?.characters?.[0].center).toEqual({ x: 0.5, y: 0.5 });
  });

  it('keeps only settings that are in range and in the enums', () => {
    const { file: parsed } = parseTransferFile(
      file({
        settings: {
          model: 'nai-diffusion-5-full',
          width: 832,
          height: 99999,
          steps: 0,
          scale: 6,
          sampler: 'not-a-sampler',
          cfgRescale: 0.5,
          qualityPreset: 'standard',
          ucPreset: 'made up',
        },
      }),
    );
    expect(parsed?.settings).toEqual({
      model: 'nai-diffusion-5-full',
      width: 832,
      scale: 6,
      cfgRescale: 0.5,
      qualityPreset: 'standard',
    });
  });

  it('drops a settings block with nothing usable in it', () => {
    expect(parseTransferFile(file({ settings: { width: -1 } })).file?.settings).toBeUndefined();
    expect(parseTransferFile(file({ settings: 'nope' })).file?.settings).toBeUndefined();
  });

  it('renames V4 Full’s old preview model id', () => {
    const { file: parsed } = parseTransferFile(file({ settings: { model: 'nai-diffusion-4-full-preview' } }));
    expect(parsed?.settings?.model).toBe('nai-diffusion-4-full');
  });

  it('only reads a preset’s prompts when it says it has them', () => {
    const values = { model: 'nai-diffusion-5-full', basePrompts: [{ id: 'p', text: 'x' }] };
    const without = parseTransferFile(file({ presets: [{ id: 'a', name: 'A', values }] }));
    expect(without.file?.presets?.[0].values.basePrompts).toBeUndefined();
    const with_ = parseTransferFile(file({ presets: [{ id: 'a', name: 'A', includesPrompts: true, values }] }));
    expect(with_.file?.presets?.[0].values.basePrompts).toHaveLength(1);
  });

  it('reads library entries, defaulting an unknown kind to fixed', () => {
    const { file: parsed } = parseTransferFile(
      file({
        tidbitLibrary: [
          { id: 'a', label: 'A', text: 'x', kind: 'random' },
          { id: 'b', label: 'B', text: 'y', kind: 'weird' },
          { id: 'c', label: 'C' },
        ],
      }),
    );
    expect(parsed?.tidbitLibrary).toEqual([
      { id: 'a', label: 'A', text: 'x', kind: 'random' },
      { id: 'b', label: 'B', text: 'y', kind: 'fixed' },
    ]);
  });

  it('does not let a file reach Object.prototype', () => {
    const parsed = parseTransferFile(
      '{"app":"zer0-novel-frontend","version":1,"__proto__":{"polluted":true},"settings":{"__proto__":{"polluted":true},"width":832}}',
    );
    expect(parsed.file).toBeDefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(parsed.file?.settings).toEqual({ width: 832 });
  });
});
