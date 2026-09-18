import type { FormSettings } from '@/store/settingsStore';
import { BasePrompt, Chain, CharacterPromptEntry, LibraryTidbit, PromptTidbit } from '@/types/novelai';
import { Preset, PRESET_SETTINGS_KEYS } from '@/lib/presets';
import { referencedEntries } from '@/lib/wildcards';
import { MODELS } from '@/lib/models';
import { parseChain } from '@/lib/chains';
import { SAMPLERS } from '@/lib/samplers';

// Import/export of prompts, characters, library entries, presets, chains and settings
// as a JSON file. The file comes from outside, so everything read from it is
// validated field by field, and malformed items are dropped rather than loaded.

const APP = 'zer0-novel-frontend';
const VERSION = 1;

export type ListKey = 'basePrompts' | 'characters' | 'tidbitLibrary' | 'presets' | 'chains';
export const LIST_KEYS: ListKey[] = ['basePrompts', 'characters', 'tidbitLibrary', 'presets', 'chains'];

type SettingsValues = Partial<Pick<FormSettings, (typeof PRESET_SETTINGS_KEYS)[number]>>;

export interface TransferFile {
  app: typeof APP;
  version: typeof VERSION;
  exportedAt: string;
  basePrompts?: BasePrompt[];
  characters?: CharacterPromptEntry[];
  tidbitLibrary?: LibraryTidbit[];
  presets?: Preset[];
  chains?: Chain[];
  settings?: SettingsValues;
  negativePrompt?: string;
}

export interface TransferSelection {
  lists: Record<ListKey, Set<string>>;
  settings: boolean;
  negativePrompt: boolean;
}

export type ImportMode = 'add' | 'replace';

// ── Export ──────────────────────────────────────────────────────────────────

export function buildExport(form: FormSettings, sel: TransferSelection): TransferFile {
  const pick = <T extends { id: string }>(items: T[], key: ListKey) =>
    structuredClone(items.filter((i) => sel.lists[key].has(i.id)));
  const file: TransferFile = { app: APP, version: VERSION, exportedAt: new Date().toISOString() };
  if (sel.lists.basePrompts.size) file.basePrompts = pick(form.basePrompts, 'basePrompts');
  if (sel.lists.characters.size) file.characters = pick(form.characters, 'characters');
  if (sel.lists.tidbitLibrary.size) file.tidbitLibrary = pick(form.tidbitLibrary, 'tidbitLibrary');
  if (sel.lists.presets.size) file.presets = pick(form.presets, 'presets');
  if (sel.lists.chains.size) file.chains = pick(form.chains, 'chains');
  if (sel.settings) {
    file.settings = Object.fromEntries(PRESET_SETTINGS_KEYS.map((k) => [k, form[k]])) as SettingsValues;
  }
  if (sel.negativePrompt) file.negativePrompt = form.negativePrompt;
  return file;
}

/** Library entries the selected prompts, characters and presets depend on
 *  (linked tidbits and `__Label__` references, followed through entries). */
export function libraryNeeds(
  source: Pick<TransferFile, 'basePrompts' | 'characters' | 'presets'>,
  library: LibraryTidbit[],
  sel: TransferSelection,
): LibraryTidbit[] {
  const prompts = (source.basePrompts ?? []).filter((p) => sel.lists.basePrompts.has(p.id));
  const chars = (source.characters ?? []).filter((c) => sel.lists.characters.has(c.id));
  for (const preset of (source.presets ?? []).filter((p) => sel.lists.presets.has(p.id))) {
    prompts.push(...(preset.values.basePrompts ?? []));
    chars.push(...(preset.values.characters ?? []));
  }
  const tidbits = [...prompts.flatMap((p) => p.tidbits ?? []), ...chars.flatMap((c) => c.tidbits ?? [])];
  const texts = [
    ...prompts.map((p) => p.text),
    ...chars.flatMap((c) => [c.prompt, c.uc]),
    ...tidbits.map((t) => t.text),
  ];
  return referencedEntries(texts, tidbits.flatMap((t) => (t.sourceId ? [t.sourceId] : [])), library);
}

// ── Parsing (untrusted input) ───────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string';
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseTidbits(v: unknown): PromptTidbit[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((t) =>
    isObj(t) && str(t.id) && str(t.text)
      ? [{
          id: t.id,
          label: str(t.label) ? t.label : '',
          text: t.text,
          enabled: t.enabled !== false,
          ...(str(t.sourceId) ? { sourceId: t.sourceId } : {}),
        }]
      : [],
  );
}

function parseBasePrompt(v: unknown): BasePrompt | null {
  if (!isObj(v) || !str(v.id) || !str(v.text)) return null;
  return { id: v.id, label: str(v.label) ? v.label : 'Imported', text: v.text, selected: v.selected === true, tidbits: parseTidbits(v.tidbits) };
}

function parseCharacter(v: unknown): CharacterPromptEntry | null {
  if (!isObj(v) || !str(v.id) || !str(v.prompt)) return null;
  const c = isObj(v.center) && num(v.center.x) && num(v.center.y) ? v.center : { x: 0.5, y: 0.5 };
  return {
    id: v.id,
    ...(str(v.label) ? { label: v.label } : {}),
    prompt: v.prompt,
    uc: str(v.uc) ? v.uc : '',
    center: { x: Math.min(1, Math.max(0, Number(c.x))), y: Math.min(1, Math.max(0, Number(c.y))) },
    enabled: v.enabled !== false,
    tidbits: parseTidbits(v.tidbits),
  };
}

function parseLibraryEntry(v: unknown): LibraryTidbit | null {
  if (!isObj(v) || !str(v.id) || !str(v.label) || !str(v.text)) return null;
  return { id: v.id, label: v.label, text: v.text, kind: v.kind === 'random' ? 'random' : 'fixed' };
}

const SETTING_CHECKS: Record<(typeof PRESET_SETTINGS_KEYS)[number], (v: unknown) => boolean> = {
  model: (v) => MODELS.some((m) => m.value === v),
  width: (v) => num(v) && v >= 64 && v <= 4096,
  height: (v) => num(v) && v >= 64 && v <= 4096,
  steps: (v) => num(v) && v >= 1 && v <= 50,
  scale: (v) => num(v) && v >= 0 && v <= 10,
  sampler: (v) => SAMPLERS.some((s) => s.value === v),
  noiseSchedule: (v) => ['native', 'karras', 'exponential', 'polyexponential'].includes(v as string),
  smea: (v) => typeof v === 'boolean',
  smeaDyn: (v) => typeof v === 'boolean',
  cfgRescale: (v) => num(v) && v >= 0 && v <= 1,
  furMode: (v) => typeof v === 'boolean',
  nsfwMode: (v) => typeof v === 'boolean',
  transparentBg: (v) => typeof v === 'boolean',
  qualityPreset: (v) => ['none', 'light', 'standard'].includes(v as string),
  ucPreset: (v) => ['none', 'light', 'heavy', 'furryFocus', 'humanFocus'].includes(v as string),
};

function parseSettings(raw: unknown): SettingsValues | undefined {
  if (!isObj(raw)) return undefined;
  // Files from before V4 Full's model ID was corrected.
  const v = raw.model === 'nai-diffusion-4-full-preview' ? { ...raw, model: 'nai-diffusion-4-full' } : raw;
  const out = Object.fromEntries(
    PRESET_SETTINGS_KEYS.flatMap((k) => (k in v && SETTING_CHECKS[k](v[k]) ? [[k, v[k]]] : [])),
  ) as SettingsValues;
  return Object.keys(out).length ? out : undefined;
}

function parsePreset(v: unknown): Preset | null {
  if (!isObj(v) || !str(v.id) || !str(v.name) || !isObj(v.values)) return null;
  const vals = v.values;
  const includesPrompts = v.includesPrompts === true;
  const values: Preset['values'] = { ...parseSettings(vals) };
  if (includesPrompts) {
    values.basePrompts = Array.isArray(vals.basePrompts) ? vals.basePrompts.map(parseBasePrompt).filter((p): p is BasePrompt => !!p) : [];
    values.characters = Array.isArray(vals.characters) ? vals.characters.map(parseCharacter).filter((c): c is CharacterPromptEntry => !!c) : [];
    if (str(vals.negativePrompt)) values.negativePrompt = vals.negativePrompt;
    if (vals.promptMode === 'single' || vals.promptMode === 'batch') values.promptMode = vals.promptMode;
    if (typeof vals.useCoords === 'boolean') values.useCoords = vals.useCoords;
  }
  return { id: v.id, name: v.name, includesPrompts, values };
}

/** Reads an export file, or explains why it can't be used. */
export function parseTransferFile(text: string): { file?: TransferFile; error?: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "That file isn't valid JSON." };
  }
  if (!isObj(raw) || raw.app !== APP) return { error: "That isn't an export from this app." };
  if (raw.version !== VERSION) return { error: `Unsupported export version (${String(raw.version)}).` };

  const list = <T>(v: unknown, parse: (x: unknown) => T | null): T[] | undefined =>
    Array.isArray(v) ? v.map(parse).filter((x): x is T => x !== null) : undefined;
  return {
    file: {
      app: APP,
      version: VERSION,
      exportedAt: str(raw.exportedAt) ? raw.exportedAt : '',
      basePrompts: list(raw.basePrompts, parseBasePrompt),
      characters: list(raw.characters, parseCharacter),
      tidbitLibrary: list(raw.tidbitLibrary, parseLibraryEntry),
      presets: list(raw.presets, parsePreset),
      chains: list(raw.chains, parseChain),
      settings: parseSettings(raw.settings),
      negativePrompt: str(raw.negativePrompt) ? raw.negativePrompt : undefined,
    },
  };
}

// ── Import ──────────────────────────────────────────────────────────────────

const sameEntry = (a: LibraryTidbit, b: LibraryTidbit) =>
  a.label === b.label && a.text === b.text && (a.kind ?? 'fixed') === (b.kind ?? 'fixed');

/**
 * Works out the new state from a file and what was picked. Imported prompts,
 * characters and presets get fresh ids so they can't collide with existing
 * ones. Imported library entries identical to one already in the library are
 * merged into it (so re-importing a file doesn't duplicate), and every linked
 * tidbit is re-pointed at wherever its entry ended up.
 */
export function applyImport(
  form: FormSettings,
  file: TransferFile,
  sel: TransferSelection,
  modes: Record<ListKey, ImportMode>,
): { changes: Partial<FormSettings>; summary: string[] } {
  const changes: Partial<FormSettings> = {};
  const summary: string[] = [];
  const picked = <T extends { id: string }>(items: T[] | undefined, key: ListKey) =>
    (items ?? []).filter((i) => sel.lists[key].has(i.id));
  const fresh = () => crypto.randomUUID();

  // Library first: everything else links into it.
  const idMap = new Map<string, string>();
  const incomingLibrary = picked(file.tidbitLibrary, 'tidbitLibrary');
  if (incomingLibrary.length) {
    if (modes.tidbitLibrary === 'replace') {
      changes.tidbitLibrary = incomingLibrary.map((e) => ({ ...e }));
      summary.push(`${incomingLibrary.length} library entr${incomingLibrary.length === 1 ? 'y' : 'ies'} (replaced)`);
    } else {
      const merged = [...form.tidbitLibrary];
      let added = 0;
      for (const entry of incomingLibrary) {
        const same = merged.find((m) => sameEntry(m, entry));
        if (same) {
          idMap.set(entry.id, same.id);
          continue;
        }
        const id = merged.some((m) => m.id === entry.id) ? fresh() : entry.id;
        idMap.set(entry.id, id);
        merged.push({ ...entry, id });
        added++;
      }
      changes.tidbitLibrary = merged;
      const skipped = incomingLibrary.length - added;
      summary.push(`${added} library entr${added === 1 ? 'y' : 'ies'}${skipped ? ` (${skipped} already there)` : ''}`);
    }
  }

  const relinkTidbits = (tidbits: PromptTidbit[] | undefined) =>
    (tidbits ?? []).map((t) => ({
      ...t,
      id: fresh(),
      ...(t.sourceId ? { sourceId: idMap.get(t.sourceId) ?? t.sourceId } : {}),
    }));
  const relinkPrompt = (p: BasePrompt): BasePrompt => ({ ...p, id: fresh(), tidbits: relinkTidbits(p.tidbits) });
  const relinkCharacter = (c: CharacterPromptEntry): CharacterPromptEntry => ({ ...c, id: fresh(), tidbits: relinkTidbits(c.tidbits) });

  const prompts = picked(file.basePrompts, 'basePrompts').map(relinkPrompt);
  if (prompts.length) {
    let next: BasePrompt[];
    if (modes.basePrompts === 'replace') {
      next = form.promptMode === 'single' ? prompts.map((p, i) => ({ ...p, selected: i === 0 })) : prompts;
    } else {
      next = [...form.basePrompts, ...prompts.map((p) => ({ ...p, selected: false }))];
      if (!next.some((p) => p.selected)) next[0] = { ...next[0], selected: true };
    }
    changes.basePrompts = next;
    summary.push(`${prompts.length} prompt${prompts.length === 1 ? '' : 's'}`);
  }

  const characters = picked(file.characters, 'characters').map(relinkCharacter);
  if (characters.length) {
    let next = modes.characters === 'replace' ? characters : [...form.characters, ...characters];
    // Keep within the model's simultaneous-character cap; extras come in off.
    const model = (sel.settings && file.settings?.model) || form.model;
    const cap = model.startsWith('nai-diffusion-5') ? 22 : 6;
    let enabled = 0;
    next = next.map((c) => (c.enabled && ++enabled > cap ? { ...c, enabled: false } : c));
    changes.characters = next;
    summary.push(`${characters.length} character${characters.length === 1 ? '' : 's'}`);
  }

  const presets = picked(file.presets, 'presets').map((p): Preset => ({
    ...p,
    id: fresh(),
    values: {
      ...p.values,
      ...(p.values.basePrompts ? { basePrompts: p.values.basePrompts.map(relinkPrompt) } : {}),
      ...(p.values.characters ? { characters: p.values.characters.map(relinkCharacter) } : {}),
    },
  }));
  if (presets.length) {
    if (modes.presets === 'replace') {
      changes.presets = presets;
    } else {
      // Presets are looked up by name when saving, so keep names unique.
      const names = new Set(form.presets.map((p) => p.name.trim().toLowerCase()));
      const renamed = presets.map((p) => {
        let name = p.name;
        for (let n = 2; names.has(name.trim().toLowerCase()); n++) name = `${p.name} (${n})`;
        names.add(name.trim().toLowerCase());
        return { ...p, name };
      });
      changes.presets = [...form.presets, ...renamed];
    }
    summary.push(`${presets.length} preset${presets.length === 1 ? '' : 's'}`);
  }

  const chains = picked(file.chains, 'chains').map((c): Chain => ({ ...c, id: fresh() }));
  if (chains.length) {
    if (modes.chains === 'replace') {
      changes.chains = chains;
      // The auto-run chain was replaced away.
      if (form.autoChainId) changes.autoChainId = null;
    } else {
      // Keep names unique, like presets.
      const names = new Set(form.chains.map((c) => c.name.trim().toLowerCase()));
      const renamed = chains.map((c) => {
        let name = c.name;
        for (let n = 2; names.has(name.trim().toLowerCase()); n++) name = `${c.name} (${n})`;
        names.add(name.trim().toLowerCase());
        return { ...c, name };
      });
      changes.chains = [...form.chains, ...renamed];
    }
    summary.push(`${chains.length} chain${chains.length === 1 ? '' : 's'}`);
  }

  if (sel.settings && file.settings) {
    Object.assign(changes, file.settings);
    summary.push('settings');
  }
  if (sel.negativePrompt && file.negativePrompt !== undefined) {
    changes.negativePrompt = file.negativePrompt;
    summary.push('negative prompt');
  }
  return { changes, summary };
}
