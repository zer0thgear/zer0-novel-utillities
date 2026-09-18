import type { FormSettings } from '@/store/settingsStore';
import { SAMPLERS } from '@/lib/samplers';
import { modelShortName } from '@/lib/models';

// Saved presets: named snapshots of the sidebar. Settings-only by default so
// loading one never touches what you're writing; prompts are opt-in per preset.

/** Generation settings and prompt modifiers. Deliberately excludes the seed
 *  (a pinned seed in a preset would silently freeze every later generation)
 *  and UI preferences like streaming mode. */
export const PRESET_SETTINGS_KEYS = [
  'model',
  'width',
  'height',
  'steps',
  'scale',
  'sampler',
  'noiseSchedule',
  'smea',
  'smeaDyn',
  'cfgRescale',
  'furMode',
  'nsfwMode',
  'transparentBg',
  'qualityPreset',
  'ucPreset',
] as const satisfies readonly (keyof FormSettings)[];

/** Saved only when "Include prompts" is checked. The Tidbit Library is never
 *  part of a preset; it's shared by every preset and prompt. */
export const PRESET_PROMPT_KEYS = [
  'basePrompts',
  'promptMode',
  'characters',
  'useCoords',
  'negativePrompt',
] as const satisfies readonly (keyof FormSettings)[];

type PresetKey = (typeof PRESET_SETTINGS_KEYS)[number] | (typeof PRESET_PROMPT_KEYS)[number];

export interface Preset {
  id: string;
  name: string;
  includesPrompts: boolean;
  values: Partial<Pick<FormSettings, PresetKey>>;
}

export function snapshotPreset(
  form: FormSettings,
  name: string,
  includePrompts: boolean,
  id: string = crypto.randomUUID(),
): Preset {
  const keys: PresetKey[] = includePrompts
    ? [...PRESET_SETTINGS_KEYS, ...PRESET_PROMPT_KEYS]
    : [...PRESET_SETTINGS_KEYS];
  // Deep-copied so later edits to prompts/characters can't reach into the preset.
  const values = Object.fromEntries(keys.map((k) => [k, structuredClone(form[k])]));
  return { id, name, includesPrompts: includePrompts, values };
}

/** e.g. "V5 Full · 832×1216 · 28 steps · CFG 6 · Euler Ancestral" */
export function presetSummary(preset: Preset): string {
  const v = preset.values;
  return [
    v.model && modelShortName(v.model),
    v.width && v.height && `${v.width}×${v.height}`,
    v.steps !== undefined && `${v.steps} steps`,
    v.scale !== undefined && `CFG ${v.scale}`,
    v.sampler && (SAMPLERS.find((s) => s.value === v.sampler)?.label ?? v.sampler),
  ]
    .filter(Boolean)
    .join(' · ');
}
