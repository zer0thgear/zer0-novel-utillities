// ─── Base prompt / mode types ─────────────────────────────────────────────────

/** A toggleable sub-prompt appended to its parent prompt's text when enabled —
 *  e.g. splitting an artist tag or location/composition details out of a base
 *  prompt, or appearance/clothing/actions out of a character prompt. UI-only;
 *  never sent to the API directly, only as composed text (see lib/promptTidbits.ts). */
export interface PromptTidbit {
  id: string;
  label: string;
  text: string;
  enabled: boolean;
}

/** A named base prompt entry in the prompt list. */
export interface BasePrompt {
  id: string;
  label: string;
  text: string;
  selected: boolean;
  /** Optional — absent on prompts persisted before this feature existed. */
  tidbits?: PromptTidbit[];
}

/** Single: one prompt selected; Batch: each selected prompt generates one image. */
export type PromptMode = 'single' | 'batch';

// ─────────────────────────────────────────────────────────────────────────────

export type NovelAIModel =
  | 'nai-diffusion-5-full'
  | 'nai-diffusion-5-full-inpainting'
  | 'nai-diffusion-5-curated'
  | 'nai-diffusion-5-curated-inpainting'
  | 'nai-diffusion-4-5-full'
  | 'nai-diffusion-4-5-full-inpainting'
  | 'nai-diffusion-4-curated-preview'
  | 'nai-diffusion-4-curated-inpainting'
  | 'nai-diffusion-4-full-preview'
  | 'nai-diffusion-4-full-inpainting'
  | 'nai-diffusion-3'
  | 'nai-diffusion-3-inpainting'
  | 'nai-diffusion-furry-3'
  | 'nai-diffusion-furry-3-inpainting';

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
  /** Optional — absent on characters persisted before this feature existed. */
  tidbits?: PromptTidbit[];
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
  /** NovelAI's "Variety+" boost. Must be `null` to match the API's own default
   *  (off) — a nonzero value forces increased output variance and is resolution/
   *  model-dependent, so never hardcode a constant here. */
  skip_cfg_above_sigma: number | null;
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
  // img2img / enhance fields
  strength?: number;
  noise?: number;
  autoSmea?: boolean;
  image?: string;
  extra_noise_seed?: number;
  inpaintImg2ImgStrength?: number;
  color_correct?: boolean;
  deliberate_euler_ancestral_bug?: boolean;
  prefer_brownian?: boolean;
  legacy_v3_extend?: boolean;
  normalize_reference_strength_multiple?: boolean;
  legacy_uc?: boolean;
  // inpainting fields
  mask?: string;
  img2img?: { strength: number; color_correct: boolean };
}

export interface NovelAIGenerateRequest {
  input: string;
  model: NovelAIModel;
  action: 'generate' | 'img2img' | 'infill';
  parameters: NovelAIParameters;
}

// ─── Director Tools (augment-image) ──────────────────────────────────────────

export type AugmentReqType =
  | 'bg-removal'
  | 'lineart'
  | 'sketch'
  | 'colorize'
  | 'emotion'
  | 'declutter';

/** Body for the `request` part of a multipart POST to /ai/augment-image.
 *  `image` is always the literal string "image" — it names the other form part. */
export interface AugmentRequest {
  req_type: AugmentReqType;
  use_new_shared_trial: false; // always pay normally; avoids the recaptcha_token requirement
  width: number;
  height: number;
  image: 'image';
  prompt?: string;
  defry?: number;
}

/** Body for the `request` part of a multipart POST to /ai/upscale. */
export interface UpscaleRequest {
  image: 'image';
  model: 'nai-diffusion-5-curated'; // dedicated upscaler model, independent of the source model
  declared_blur_sigma: number;
}

// ─── Subscription / Opus usage (GET /user/subscription) ──────────────────────

export interface NovelAISubscription {
  tier: number; // 0=Paper, 1=Tablet, 2=Scroll, 3=Opus
  active: boolean;
  expiresAt: number; // unix seconds
  perks: {
    maxPriorityActions: number;
    startPriority: number;
    contextTokens: number;
    unlimitedMaxPriority: boolean;
    moduleTrainingSteps: number;
  };
  accountType: number;
  isGracePeriod: boolean;
  isPaypal: boolean;
  /** Opus's free V5 generation allowance (normal resolution, <=28 steps). */
  usage: {
    percent: number; // 0-100+, clamped display-side; recovery pauses above 100
    isNegative: boolean;
    timeUntilNextPercent: number; // seconds until the next 1% tick
  };
  /** Despite the name, this is the Anlas balance — confirmed against NovelAI's own
   *  "Purchase Anlas" modal, which labels these two fields "Your Subscription Anlas"
   *  and "Your Paid Anlas" respectively. Total Anlas = the sum of both. */
  trainingStepsLeft: {
    fixedTrainingStepsLeft: number;
    purchasedTrainingSteps: number;
  };
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
  // Enhancement provenance — set when this image was produced by img2img/enhance
  sourceImageId?: string;   // ID of the source image in the session
  sourceImageUrl?: string;  // Separate object URL for the source (survives source deletion)
  // Shared across every image produced by one "Copies" request (true batch or
  // queued) — lets the gallery clump them visually. Absent for single generations.
  batchId?: string;
}
