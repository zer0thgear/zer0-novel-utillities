// ─── Base prompt / mode types ─────────────────────────────────────────────────

/** A named base prompt entry in the prompt list. */
export interface BasePrompt {
  id: string;
  label: string;
  text: string;
  selected: boolean;
}

/** Single: one prompt selected; Batch: each selected prompt generates one image. */
export type PromptMode = 'single' | 'batch';

// ─────────────────────────────────────────────────────────────────────────────

export type NovelAIModel =
  | 'nai-diffusion-4-5-full'
  | 'nai-diffusion-4-curated-preview'
  | 'nai-diffusion-4-full-preview'
  | 'nai-diffusion-3'
  | 'nai-diffusion-furry-3';

export type NovelAISampler =
  | 'k_euler'
  | 'k_euler_ancestral'
  | 'k_dpmpp_2s_ancestral'
  | 'k_dpmpp_2m'
  | 'k_dpmpp_2m_sde'
  | 'k_dpmpp_sde'
  | 'ddim_v3';

export type NovelAINoiseSchedule =
  | 'native'
  | 'karras'
  | 'exponential'
  | 'polyexponential';

// ─── Character prompt types ───────────────────────────────────────────────────

/** API-level character prompt (sent in the request body). */
export interface CharacterPrompt {
  prompt: string;
  uc: string;
  center: { x: number; y: number };
  enabled: boolean;
}

/** Form-state character prompt — includes UI-only fields not sent to the API.
 *  `id` is used as a React key; `label` is a user-visible name only. */
export interface CharacterPromptEntry extends CharacterPrompt {
  id: string;
  /** Display name shown in the editor header. Not sent to the API. */
  label?: string;
}

// ─── V4 prompt structures ─────────────────────────────────────────────────────

export interface V4CharCaption {
  char_caption: string;
  centers: { x: number; y: number }[];
}

export interface V4Prompt {
  caption: {
    base_caption: string;
    char_captions: V4CharCaption[];
  };
  use_coords: boolean;
  use_order: boolean;
}

export interface V4NegativePrompt {
  caption: {
    base_caption: string;
    char_captions: V4CharCaption[];
  };
  legacy_uc: boolean;
}

// ─── Parameters ───────────────────────────────────────────────────────────────

export interface NovelAIParameters {
  width: number;
  height: number;
  scale: number;
  sampler: NovelAISampler;
  steps: number;
  n_samples: number;
  ucPreset: number;
  qualityToggle: boolean;
  sm: boolean;
  sm_dyn: boolean;
  dynamic_thresholding: boolean;
  controlnet_strength: number;
  legacy: boolean;
  add_original_image: boolean;
  cfg_rescale: number;
  noise_schedule: NovelAINoiseSchedule;
  seed: number;
  negative_prompt: string;
  reference_image_multiple: string[];
  reference_information_extracted_multiple: number[];
  reference_strength_multiple: number[];
  // V4 fields — only included when using character prompts or v4 models
  params_version?: number;
  use_coords?: boolean;
  v4_prompt?: V4Prompt;
  v4_negative_prompt?: V4NegativePrompt;
  characterPrompts?: CharacterPrompt[];
}

export interface NovelAIGenerateRequest {
  input: string;
  model: NovelAIModel;
  action: 'generate';
  parameters: NovelAIParameters;
}

export interface GeneratedImage {
  id: string;
  url: string; // object URL - freed on session clear / image removal
  blob: Blob;
  prompt: string;
  negativePrompt: string;
  model: NovelAIModel;
  parameters: NovelAIParameters;
  timestamp: number;
  seed: number;
}
