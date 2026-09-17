import { NovelAIModel } from '@/types/novelai';
import { joinPromptParts } from '@/lib/promptText';

// Quality Tags / UC Preset literal text, per NovelAI's own official documentation
// (docs.novelai.net/en/image/qualitytags, docs.novelai.net/en/image/undesiredcontent —
// confirmed 2026-09-17 against novelai.net's own V5 UI, which now exposes both as
// hidden server-side presets rather than visible prompt text; this app instead
// injects the documented literal text directly, which is how these presets worked
// natively before NovelAI moved the expansion server-side, and is the only way to
// reproduce them without access to NovelAI's own preset IDs). See
// memory/project_novelai_quality_uc_presets.md for the investigation this replaces.

export type ModelFamily = 'v5' | 'v45full' | 'v4full' | 'v4curated' | 'v3anime' | 'v3furry';

export function getModelFamily(model: NovelAIModel): ModelFamily {
  if (model.startsWith('nai-diffusion-5')) return 'v5';
  if (model.startsWith('nai-diffusion-4-5')) return 'v45full';
  if (model.startsWith('nai-diffusion-4-curated')) return 'v4curated';
  if (model.startsWith('nai-diffusion-4')) return 'v4full';
  if (model === 'nai-diffusion-furry-3' || model === 'nai-diffusion-furry-3-inpainting') return 'v3furry';
  return 'v3anime';
}

export type QualityLevel = 'none' | 'light' | 'standard';

// Every family exposes 'standard' as its single on/off toggle's text, except v5
// which has a real Light/Standard split.
const QUALITY_TEXT: Record<ModelFamily, Partial<Record<QualityLevel, string>>> = {
  v5: {
    light: ', very aesthetic, amazing quality, no text',
    standard: ', very aesthetic, masterpiece, no text',
  },
  v45full: {
    standard: ', location, very aesthetic, masterpiece, no text',
  },
  v4full: {
    standard: ', no text, best quality, very aesthetic, absurdres',
  },
  v4curated: {
    standard: ', rating:general, amazing quality, very aesthetic, absurdres',
  },
  v3anime: {
    standard: ', best quality, amazing quality, very aesthetic, absurdres',
  },
  v3furry: {
    standard: ', {best quality}, {amazing quality}',
  },
};

export function getAvailableQualityLevels(model: NovelAIModel): QualityLevel[] {
  const levels = Object.keys(QUALITY_TEXT[getModelFamily(model)]) as QualityLevel[];
  return ['none', ...levels];
}

export function getQualityText(model: NovelAIModel, level: QualityLevel): string {
  if (level === 'none') return '';
  return QUALITY_TEXT[getModelFamily(model)][level] ?? '';
}

export type UcLevel = 'none' | 'light' | 'heavy' | 'furryFocus' | 'humanFocus';

const UC_TEXT: Record<ModelFamily, Partial<Record<UcLevel, string>>> = {
  v5: {
    heavy:
      'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page',
    light:
      'lowres, bad hands, bad anatomy, artistic error, sepia, white haze, worst quality, very displeasing, jpeg artifacts, 0::ai-generated::',
    furryFocus:
      '{worst quality}, distracting watermark, unfinished, bad quality, {widescreen}, upscale, {sequence}, {{grandfathered content}}, blurred foreground, chromatic aberration, sketch, everyone, [sketch background], simple, [flat colors], ych (character), outline, multiple scenes, [[horror (theme)]], comic',
    humanFocus:
      'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy',
  },
  v45full: {
    heavy:
      'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page',
    light:
      'lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page',
    furryFocus:
      '{worst quality}, distracting watermark, unfinished, bad quality, {widescreen}, upscale, {sequence}, {{grandfathered content}}, blurred foreground, chromatic aberration, sketch, everyone, [sketch background], simple, [flat colors], ych (character), outline, multiple scenes, [[horror (theme)]], comic',
    humanFocus:
      'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy',
  },
  v4full: {
    heavy:
      'blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, multiple views, logo, too many watermarks',
    light: 'blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing',
  },
  v4curated: {
    heavy:
      'blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, logo, dated, signature, multiple views, gigantic breasts',
    light:
      'blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing, logo, dated, signature',
  },
  // NovelAI's docs present "V3" as a single UC preset set, not split by Anime/Furry —
  // used for both nai-diffusion-3 and nai-diffusion-furry-3 here. Flag for follow-up
  // if a Furry-3-specific list ever surfaces.
  v3anime: {
    heavy:
      'lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract]',
    light: 'lowres, jpeg artifacts, worst quality, watermark, blurry, very displeasing',
    humanFocus:
      'lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract], bad anatomy, bad hands, @_@, mismatched pupils, heart-shaped pupils, glowing eyes',
  },
  v3furry: {
    heavy:
      'lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract]',
    light: 'lowres, jpeg artifacts, worst quality, watermark, blurry, very displeasing',
    humanFocus:
      'lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract], bad anatomy, bad hands, @_@, mismatched pupils, heart-shaped pupils, glowing eyes',
  },
};

export function getAvailableUcLevels(model: NovelAIModel): UcLevel[] {
  const levels = Object.keys(UC_TEXT[getModelFamily(model)]) as UcLevel[];
  return ['none', ...levels];
}

export function getUcText(model: NovelAIModel, level: UcLevel): string {
  if (level === 'none') return '';
  return UC_TEXT[getModelFamily(model)][level] ?? '';
}

export const QUALITY_LEVEL_LABELS: Record<QualityLevel, string> = {
  none: 'None',
  light: 'Light',
  standard: 'Standard',
};

export const UC_LEVEL_LABELS: Record<UcLevel, string> = {
  none: 'None',
  light: 'Light',
  heavy: 'Heavy',
  furryFocus: 'Furry Focus',
  humanFocus: 'Human Focus',
};

// ─── Composition helpers ──────────────────────────────────────────────────────
// Centralized since every request-building site (PromptForm, useEnhance,
// useInpaint, useEdit) needs the same logic.

/** Appends the model's quality preset text to a positive prompt, verbatim.
 *  The preset tables carry NovelAI's documented text including its leading
 *  ", " — joinPromptParts normalizes that away and re-adds the delimiter, so
 *  the tables stay verbatim-comparable against docs.novelai.net. */
export function composeWithQuality(text: string, model: NovelAIModel, level: QualityLevel): string {
  return joinPromptParts(text, getQualityText(model, level));
}

/**
 * Prepends the model's UC preset tags to a negative prompt, skipping any tag
 * that already appears in `positiveSearchText` (lowercased) to avoid injecting
 * a negative tag that contradicts something the user explicitly asked for.
 */
export function composeNegativeWithUc(
  negativePrompt: string,
  model: NovelAIModel,
  level: UcLevel,
  positiveSearchText: string,
): string {
  const presetText = getUcText(model, level);
  if (!presetText) return negativePrompt;
  const tags = presetText
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t && !positiveSearchText.includes(t.toLowerCase()));
  if (tags.length === 0) return negativePrompt;
  return joinPromptParts(tags.join(', '), negativePrompt);
}
