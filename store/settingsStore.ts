import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  BasePrompt,
  CharacterPromptEntry,
  NovelAIModel,
  NovelAISampler,
  NovelAINoiseSchedule,
  PromptMode,
} from '@/types/novelai';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FormSettings {
  basePrompts: BasePrompt[];
  promptMode: PromptMode;
  furMode: boolean;
  nsfwMode: boolean;
  qualityTags: boolean;
  baseNegativeCaptions: boolean;
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
  qualityToggle: boolean;
  cfgRescale: number;
  characters: CharacterPromptEntry[];
  useCoords: boolean;
  streamingMode: boolean;
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
  qualityTags: false,
  baseNegativeCaptions: false,
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
  qualityToggle: true,
  cfgRescale: 0,
  characters: [],
  useCoords: false,
  streamingMode: false,
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
      version: 2,
      // Migrate from v1 (single prompt: string) → v2 (basePrompts: BasePrompt[])
      migrate(persistedState: unknown, version: number) {
        const s = persistedState as Record<string, unknown>;
        if (version < 2) {
          const oldPrompt = typeof s.prompt === 'string' ? s.prompt : '';
          return {
            ...s,
            basePrompts: [{ id: 'migrated', label: 'Prompt 1', text: oldPrompt, selected: true }],
            promptMode: 'single' as PromptMode,
            furMode: false,
            prompt: undefined,
          };
        }
        return s as unknown as FormSettings;
      },
      storage: createJSONStorage(() => localStorage),
    }
  )
);
