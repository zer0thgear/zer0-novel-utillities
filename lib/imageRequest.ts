import type { FormSettings } from '@/store/settingsStore';
import {
  CharacterPromptEntry,
  NovelAIGenerateRequest,
  NovelAIModel,
  NovelAIParameters,
  NovelAISampler,
  PromptSource,
  WildcardPicks,
} from '@/types/novelai';
import { resolveRequestPrompts, ResolvedRequestPrompts } from '@/lib/wildcards';
import { joinPromptParts } from '@/lib/promptText';
import { composeNegativeWithUc, composeWithQuality } from '@/lib/naiPresets';

// Shared assembly for every /ai/generate-image request: main Generate (incl.
// Copies, sweeps and img2img), Enhance, Inpaint, Edit and Variations. Each
// flow supplies only what's specific to it; everything else lives here once.
// The field set each flow sends is deliberately unchanged from before this was
// shared: main Generate's matches NovelAI's own client pixel-for-pixel (see
// docs/REVERSE_ENGINEERING.md), so don't add "harmless" extra fields to it.

export const randomSeed = () => Math.floor(Math.random() * 4294967295);

type PromptModifiers = Pick<
  FormSettings,
  'furMode' | 'nsfwMode' | 'transparentBg' | 'model' | 'qualityPreset' | 'ucPreset'
>;

/** Rolls the form's selected base prompt, replaying an image's picks when
 *  reworking that image so it doesn't re-roll. */
export function resolveSelectedPrompt(form: FormSettings, replay?: WildcardPicks): ResolvedRequestPrompts {
  const selected = form.basePrompts.find((p) => p.selected);
  return resolveRequestPrompts(selected ?? { text: '' }, form.characters, form.negativePrompt, form.tidbitLibrary, replay);
}

/** Applies the prompt modifiers to resolved text as NovelAI's client does:
 *  fur/nsfw prefixes, then transparent background and the quality preset
 *  (see composeWithQuality for where they go), an optional flow-specific
 *  suffix, and the UC preset (whose `nsfw` rule reads the final prompt). */
export function composeFinalPrompts(
  form: PromptModifiers,
  resolved: ResolvedRequestPrompts,
  extraPositive?: string,
): { input: string; negativePrompt: string } {
  const prefixes: string[] = [];
  if (form.furMode) prefixes.push('fur dataset');
  if (form.nsfwMode) prefixes.push('nsfw');

  let input = composeWithQuality(
    joinPromptParts(...prefixes, resolved.baseText),
    form.model,
    form.qualityPreset,
    form.transparentBg,
  );
  if (extraPositive) input = joinPromptParts(input, extraPositive);

  const negativePrompt = composeNegativeWithUc(resolved.negativePrompt, form.model, form.ucPreset, input);
  return { input, negativePrompt };
}

/** What "Reuse" needs to restore a request's prompt as written: the resolved
 *  text before composeFinalPrompts adds anything, and the modifiers it used. */
export function promptSource(form: PromptModifiers, resolved: ResolvedRequestPrompts): PromptSource {
  return {
    prompt: resolved.baseText,
    negativePrompt: resolved.negativePrompt,
    modifiers: {
      furMode: form.furMode,
      nsfwMode: form.nsfwMode,
      transparentBg: form.transparentBg,
      qualityPreset: form.qualityPreset,
      ucPreset: form.ucPreset,
    },
  };
}

type SamplingKey =
  | 'params_version'
  | 'width'
  | 'height'
  | 'scale'
  | 'sampler'
  | 'steps'
  | 'ucPreset'
  | 'qualityToggle'
  | 'sm'
  | 'sm_dyn'
  | 'cfg_rescale'
  | 'noise_schedule'
  | 'skip_cfg_above_sigma';

/** Size and sampling fields as the form has them, with a sweep cell's values
 *  (if any) taking precedence. */
export function formSampling(
  form: FormSettings,
  overrides: { scale?: number; steps?: number; sampler?: NovelAISampler } = {},
): Pick<NovelAIParameters, SamplingKey> {
  return {
    params_version: 3,
    width: form.width,
    height: form.height,
    scale: overrides.scale ?? form.scale,
    sampler: overrides.sampler ?? form.sampler,
    steps: overrides.steps ?? form.steps,
    ucPreset: 0,
    qualityToggle: form.qualityToggle,
    sm: form.smea,
    sm_dyn: form.smeaDyn,
    cfg_rescale: form.cfgRescale,
    noise_schedule: form.noiseSchedule,
    // Must be null unless deliberately enabling "Variety+" (see NovelAIParameters).
    skip_cfg_above_sigma: null,
  };
}

/** Fields NovelAI's client sends on its image-editing requests (Enhance,
 *  Inpaint, Edit, Variations) but not on a plain generation. */
export const EDIT_REQUEST_FLAGS = {
  autoSmea: false,
  sm: false,
  sm_dyn: false,
  legacy_v3_extend: false,
  normalize_reference_strength_multiple: true,
} as const;

type SharedKey =
  | 'dynamic_thresholding'
  | 'controlnet_strength'
  | 'legacy'
  | 'use_coords'
  | 'deliberate_euler_ancestral_bug'
  | 'prefer_brownian'
  | 'negative_prompt'
  | 'legacy_uc'
  | 'reference_image_multiple'
  | 'reference_information_extracted_multiple'
  | 'reference_strength_multiple'
  | 'v4_prompt'
  | 'v4_negative_prompt'
  | 'characterPrompts';

/** Wraps flow-specific parameters with the fields every request shares: the
 *  determinism-critical sampler flags, the V4+ caption structure, and the
 *  (currently empty) reference-image slots. */
export function buildImageRequest(args: {
  input: string;
  negativePrompt: string;
  model: NovelAIModel;
  action: NovelAIGenerateRequest['action'];
  /** Enabled characters with final text (see resolveRequestPrompts). */
  characters: CharacterPromptEntry[];
  useCoords: boolean;
  parameters: Omit<NovelAIParameters, SharedKey>;
}): NovelAIGenerateRequest {
  const { input, negativePrompt, model, action, characters, useCoords, parameters } = args;
  return {
    input,
    model,
    action,
    parameters: {
      ...parameters,
      dynamic_thresholding: false,
      controlnet_strength: 1,
      legacy: false,
      use_coords: useCoords,
      deliberate_euler_ancestral_bug: false,
      prefer_brownian: true,
      negative_prompt: negativePrompt,
      legacy_uc: false,
      reference_image_multiple: [],
      reference_information_extracted_multiple: [],
      reference_strength_multiple: [],
      v4_prompt: {
        caption: {
          base_caption: input,
          char_captions: characters.map((c) => ({ char_caption: c.prompt, centers: [c.center] })),
        },
        use_coords: useCoords,
        use_order: true,
      },
      v4_negative_prompt: {
        caption: {
          base_caption: negativePrompt,
          char_captions: characters.map((c) => ({ char_caption: c.uc, centers: [c.center] })),
        },
        legacy_uc: false,
      },
      characterPrompts: characters.map((c) => ({
        prompt: c.prompt,
        uc: c.uc,
        center: c.center,
        enabled: c.enabled,
      })),
    },
  };
}
