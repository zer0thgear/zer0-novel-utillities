import { useState } from 'react';
import { useGenerate } from '@/hooks/useGenerate';
import { useSessionStore } from '@/store/sessionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { GeneratedImage, NovelAIGenerateRequest } from '@/types/novelai';

// ─── Enhance level config ─────────────────────────────────────────────────────

export const ENHANCE_LEVELS = [
  { level: 1 as const, strength: 0.2, noise: 0,   anlas: 9  },
  { level: 2 as const, strength: 0.4, noise: 0,   anlas: 18 },
  { level: 3 as const, strength: 0.5, noise: 0,   anlas: 23 },
  { level: 4 as const, strength: 0.6, noise: 0,   anlas: 27 },
  { level: 5 as const, strength: 0.7, noise: 0.1, anlas: 32 },
];

export type EnhanceLevelNum = 1 | 2 | 3 | 4 | 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const BASE_NEGATIVE_TAGS = [
  'nsfw', 'lowres', 'artistic error', 'film grain', 'scan artifacts',
  'worst quality', 'bad quality', 'jpeg artifacts', 'very displeasing',
  'chromatic aberration', 'dithering', 'halftone', 'screentone',
  'multiple views', 'logo', 'too many watermarks', 'negative space', 'blank page',
];

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseEnhanceReturn {
  enhance: (image: GeneratedImage, level: EnhanceLevelNum, upscale: boolean) => Promise<boolean>;
  isEnhancing: boolean;
  error: string | null;
  clearError: () => void;
}

export function useEnhance(): UseEnhanceReturn {
  const [isEnhancing, setIsEnhancing] = useState(false);
  // Delegate to useGenerate for streaming/non-streaming logic and error state
  const { generate, error, clearError } = useGenerate();
  const { setIsLoading } = useSessionStore();
  const form = useSettingsStore();

  const enhance = async (
    image: GeneratedImage,
    levelNum: EnhanceLevelNum,
    upscale: boolean,
  ): Promise<boolean> => {
    setIsEnhancing(true);
    setIsLoading(true); // shows gallery progress indicator / streaming preview

    try {
      const level = ENHANCE_LEVELS[levelNum - 1];
      const imageB64 = await blobToBase64(image.blob);

      // Dimensions — round to nearest 64 when upscaling
      const round64 = (n: number) => Math.round(n / 64) * 64;
      const width  = upscale ? round64(image.parameters.width  * 1.5) : image.parameters.width;
      const height = upscale ? round64(image.parameters.height * 1.5) : image.parameters.height;

      // ── Prompt assembly (mirrors PromptForm.buildRequest) ──────────────────
      const prefixes: string[] = [];
      if (form.furMode)  prefixes.push('fur dataset');
      if (form.nsfwMode) prefixes.push('nsfw');
      const baseText = form.basePrompts.find((p) => p.selected)?.text ?? '';
      const prefixedText = prefixes.length > 0
        ? `${prefixes.join(', ')}, ${baseText}`
        : baseText;

      const activeCharacters = form.characters.filter((c) => c.enabled);

      let finalText = prefixedText;
      if (form.qualityTags) {
        const hasTextToken =
          form.basePrompts.some((p) => p.text.includes('Text:')) ||
          form.characters.some((c) => c.prompt.includes('Text:'));
        finalText = prefixedText + ', very aesthetic, masterpiece' + (hasTextToken ? '' : ', no text');
      }

      // ── Negative prompt assembly ───────────────────────────────────────────
      const baseNegPrompt = (() => {
        if (!form.baseNegativeCaptions) return form.negativePrompt;
        const searchText = [
          ...form.basePrompts.map((p) => p.text),
          ...form.characters.map((c) => c.prompt),
        ].join(' ').toLowerCase();
        const tags = BASE_NEGATIVE_TAGS.filter((t) => !searchText.includes(t.toLowerCase()));
        if (tags.length === 0) return form.negativePrompt;
        return form.negativePrompt
          ? `${tags.join(', ')}, ${form.negativePrompt}`
          : tags.join(', ');
      })();

      const seed = Math.floor(Math.random() * 4294967295);
      const extraNoiseSeed = Math.floor(Math.random() * 4294967295);

      const request: NovelAIGenerateRequest = {
        input: finalText,
        model: form.model,
        action: 'img2img',
        parameters: {
          params_version: 3,
          width,
          height,
          scale: form.scale,
          sampler: form.sampler,
          steps: form.steps,
          n_samples: 1,
          strength: level.strength,
          noise: level.noise,
          ucPreset: 0,
          qualityToggle: form.qualityToggle,
          autoSmea: false,
          sm: false,
          sm_dyn: false,
          dynamic_thresholding: false,
          controlnet_strength: 1,
          legacy: false,
          legacy_v3_extend: false,
          add_original_image: true,
          cfg_rescale: form.cfgRescale,
          noise_schedule: form.noiseSchedule,
          skip_cfg_above_sigma: 59.04722600415217,
          use_coords: form.useCoords,
          normalize_reference_strength_multiple: true,
          inpaintImg2ImgStrength: 0,
          seed,
          extra_noise_seed: extraNoiseSeed,
          image: imageB64,
          color_correct: false,
          deliberate_euler_ancestral_bug: false,
          prefer_brownian: true,
          negative_prompt: baseNegPrompt,
          legacy_uc: false,
          reference_image_multiple: [],
          reference_information_extracted_multiple: [],
          reference_strength_multiple: [],
          v4_prompt: {
            caption: {
              base_caption: finalText,
              char_captions: activeCharacters.map((c) => ({
                char_caption: c.prompt,
                centers: [c.center],
              })),
            },
            use_coords: form.useCoords,
            use_order: true,
          },
          v4_negative_prompt: {
            caption: {
              base_caption: baseNegPrompt,
              char_captions: activeCharacters.map((c) => ({
                char_caption: c.uc,
                centers: [c.center],
              })),
            },
            legacy_uc: false,
          },
          characterPrompts: activeCharacters.map((c) => ({
            prompt: c.prompt,
            uc: c.uc,
            center: c.center,
            enabled: c.enabled,
          })),
        },
      };

      // Delegate to useGenerate — handles streaming/non-streaming transparently
      // Create a fresh object URL for the source image so the enhanced image can
      // display it even if the source is later removed from the session.
      const sourceImageUrl = URL.createObjectURL(image.blob);
      return await generate(request, { sourceImageId: image.id, sourceImageUrl });
    } catch (err) {
      // blobToBase64 failures land here; API errors are handled by generate()
      console.error('Enhance setup error:', err);
      return false;
    } finally {
      setIsEnhancing(false);
      setIsLoading(false);
    }
  };

  return { enhance, isEnhancing, error, clearError };
}
