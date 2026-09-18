import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  BasePrompt,
  CharacterPromptEntry,
  LibraryTidbit,
  NovelAIModel,
  NovelAISampler,
  NovelAINoiseSchedule,
  PromptMode,
} from '@/types/novelai';
import { QualityLevel, UcLevel } from '@/lib/naiPresets';
import type { Preset } from '@/lib/presets';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FormSettings {
  basePrompts: BasePrompt[];
  promptMode: PromptMode;
  furMode: boolean;
  nsfwMode: boolean;
  transparentBg: boolean;
  qualityPreset: QualityLevel;
  ucPreset: UcLevel;
  negativePrompt: string;
  model: NovelAIModel;
  width: number;
  height: number;
  steps: number;
  scale: number;
  sampler: NovelAISampler;
  noiseSchedule: NovelAINoiseSchedule;
  seed: number;
  smea: boolean;
  smeaDyn: boolean;
  cfgRescale: number;
  characters: CharacterPromptEntry[];
  useCoords: boolean;
  streamingMode: boolean;
  /** Reusable tidbits, linked into prompts by id. No persist migration needed —
   *  zustand merges defaults under the persisted state, so older saves just
   *  start with an empty library. */
  tidbitLibrary: LibraryTidbit[];
  /** Saved snapshots of the settings above (see lib/presets.ts). Same as the
   *  library: absent from older saves, so it just defaults to empty. */
  presets: Preset[];
}

interface SettingsState extends FormSettings {
  set: <K extends keyof FormSettings>(key: K, value: FormSettings[K]) => void;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_NEGATIVE =
  'lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract]';

const DEFAULTS: FormSettings = {
  basePrompts: [{ id: 'p-default', label: 'Prompt 1', text: '', selected: true }],
  promptMode: 'single',
  furMode: false,
  nsfwMode: false,
  transparentBg: false,
  qualityPreset: 'none',
  ucPreset: 'none',
  negativePrompt: DEFAULT_NEGATIVE,
  model: 'nai-diffusion-4-5-full',
  width: 832,
  height: 1216,
  steps: 28,
  scale: 6,
  sampler: 'k_euler_ancestral',
  noiseSchedule: 'karras',
  seed: 0,
  smea: false,
  smeaDyn: false,
  cfgRescale: 0,
  characters: [],
  useCoords: false,
  streamingMode: false,
  tidbitLibrary: [],
  presets: [],
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsState>()(
  persist(
    (setState) => ({
      ...DEFAULTS,
      set: (key, value) => setState((state) => ({ ...state, [key]: value })),
    }),
    {
      name: 'novelai-settings',
      version: 4,
      migrate(persistedState: unknown, version: number) {
        let s = persistedState as Record<string, unknown>;
        // v1 -> v2: single prompt: string -> basePrompts: BasePrompt[]
        if (version < 2) {
          const oldPrompt = typeof s.prompt === 'string' ? s.prompt : '';
          s = {
            ...s,
            basePrompts: [{ id: 'migrated', label: 'Prompt 1', text: oldPrompt, selected: true }],
            promptMode: 'single' as PromptMode,
            furMode: false,
            prompt: undefined,
          };
        }
        // v2 -> v3: qualityTags/baseNegativeCaptions booleans -> real per-model
        // qualityPreset/ucPreset levels (see lib/naiPresets.ts). A prior "on"
        // boolean maps to each model's single documented "standard"/"heavy"
        // level rather than being silently dropped.
        if (version < 3) {
          s = {
            ...s,
            qualityPreset: s.qualityTags ? 'standard' : 'none',
            ucPreset: s.baseNegativeCaptions ? 'heavy' : 'none',
            qualityTags: undefined,
            baseNegativeCaptions: undefined,
          };
        }
        // v3 -> v4: the Quality Toggle setting is gone (requests no longer send
        // qualityToggle, matching NovelAI's own client).
        if (version < 4) {
          s = { ...s, qualityToggle: undefined };
        }
        return s as unknown as FormSettings;
      },
      storage: createJSONStorage(() => localStorage),
    }
  )
);
