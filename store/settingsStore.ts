import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  BasePrompt,
  Chain,
  CharacterPromptEntry,
  LibraryTidbit,
  NovelAIModel,
  NovelAISampler,
  NovelAINoiseSchedule,
  PromptMode,
  PromptTidbit,
} from '@/types/novelai';
import { QualityLevel, UcLevel } from '@/lib/naiPresets';
import type { Preset } from '@/lib/presets';
import type { SweepPreset } from '@/lib/sweepPresets';

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
  /** Tidbits appended to the negative prompt, like a base prompt's. */
  negativeTidbits: PromptTidbit[];
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
  /** Variety+ (skip_cfg_above_sigma). Only some models offer it; see lib/variety.ts. */
  variety: boolean;
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
  /** Saved chained actions (see lib/chains.ts). Absent from older saves. */
  chains: Chain[];
  /** Saved sweep setups (see lib/sweepPresets.ts). Absent from older saves. */
  sweepPresets: SweepPreset[];
  /** Chain to offer on every new generation's results, or null. */
  autoChainId: string | null;
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
  negativeTidbits: [],
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
  variety: false,
  characters: [],
  useCoords: false,
  streamingMode: false,
  tidbitLibrary: [],
  presets: [],
  chains: [],
  sweepPresets: [],
  autoChainId: null,
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
      version: 6,
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
        // v4 -> v5: V4 Full's model ID was wrong ("-preview" is only on V4
        // Curated); the API rejects it, so carry saved selections over.
        if (version < 5) {
          const fix = (m: unknown) => (m === 'nai-diffusion-4-full-preview' ? 'nai-diffusion-4-full' : m);
          s = {
            ...s,
            model: fix(s.model),
            presets: Array.isArray(s.presets)
              ? s.presets.map((p) =>
                  p && typeof p === 'object' && 'values' in p
                    ? { ...p, values: { ...(p as { values: object }).values, model: fix((p as { values: { model?: unknown } }).values.model) } }
                    : p,
                )
              : s.presets,
          };
        }
        // v5 -> v6: enhance chain steps pick NovelAI's scales instead of an
        // "Upscale ×1.5" checkbox.
        if (version < 6 && Array.isArray(s.chains)) {
          s = {
            ...s,
            chains: s.chains.map((c) =>
              c && typeof c === 'object' && Array.isArray((c as { steps?: unknown }).steps)
                ? {
                    ...c,
                    steps: (c as { steps: Record<string, unknown>[] }).steps.map((st) => {
                      if (st?.kind !== 'enhance' || 'scale' in st) return st;
                      const { upscale, ...rest } = st;
                      return { ...rest, scale: upscale === true ? 1.5 : 1 };
                    }),
                  }
                : c,
            ),
          };
        }
        return s as unknown as FormSettings;
      },
      storage: createJSONStorage(() => localStorage),
    }
  )
);
