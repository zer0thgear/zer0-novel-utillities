import { useState } from 'react';
import { useGenerate } from '@/hooks/useGenerate';
import { useSessionStore } from '@/store/sessionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { GeneratedImage } from '@/types/novelai';
import {
  buildImageRequest,
  composeFinalPrompts,
  EDIT_REQUEST_FLAGS,
  formSampling,
  promptSource,
  randomSeed,
  resolveReworkPrompt,
} from '@/lib/imageRequest';
import { blobToBase64 } from '@/lib/imageUtils';
import { addMissingTags } from '@/lib/naiPresets';

// ─── Enhance level config ─────────────────────────────────────────────────────

// Anlas cost depends only on resolution, steps, and sample count — never on
// strength/noise (confirmed live: varying either on NovelAI's own img2img UI
// left the displayed cost unchanged). All five levels use the same steps as
// the main form, so they all cost the same; there's deliberately no per-level
// anlas figure here anymore — a prior version showed five different fabricated
// numbers, which was actively misleading. See memory/project_novelai_editing_tools_api.md.
export const ENHANCE_LEVELS = [
  { level: 1 as const, strength: 0.2, noise: 0 },
  { level: 2 as const, strength: 0.4, noise: 0 },
  { level: 3 as const, strength: 0.5, noise: 0 },
  { level: 4 as const, strength: 0.6, noise: 0 },
  { level: 5 as const, strength: 0.7, noise: 0.1 },
];

export type EnhanceLevelNum = 1 | 2 | 3 | 4 | 5;

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseEnhanceReturn {
  /** `extraTags` (from a chain's Add Tags step) go into this request only. */
  enhance: (
    image: GeneratedImage,
    level: EnhanceLevelNum,
    upscale: boolean,
    extraTags?: string,
  ) => Promise<GeneratedImage[] | null>;
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
    extraTags?: string,
  ): Promise<GeneratedImage[] | null> => {
    setIsEnhancing(true);
    setIsLoading(true); // shows gallery progress indicator / streaming preview

    try {
      const level = ENHANCE_LEVELS[levelNum - 1];
      const imageB64 = await blobToBase64(image.blob);

      // Dimensions — round to nearest 64 when upscaling
      const round64 = (n: number) => Math.round(n / 64) * 64;
      const width  = upscale ? round64(image.parameters.width  * 1.5) : image.parameters.width;
      const height = upscale ? round64(image.parameters.height * 1.5) : image.parameters.height;

      // Replays the source image's wildcard rolls, so reworking it doesn't re-roll.
      const rolled = resolveReworkPrompt(form, image);
      const resolved = extraTags ? { ...rolled, baseText: addMissingTags(rolled.baseText, form.model, extraTags) } : rolled;
      // Enhance always nudges away from an upscaled/blurry look.
      const { input, negativePrompt } = composeFinalPrompts(form, resolved, '-2::upscaled, blurry::');
      const seed = randomSeed();
      const extraNoiseSeed = randomSeed();

      const request = buildImageRequest({
        input,
        negativePrompt,
        model: form.model,
        action: 'img2img',
        characters: resolved.characters,
        useCoords: form.useCoords,
        presets: { quality: form.qualityPreset, uc: form.ucPreset },
        parameters: {
          ...formSampling(form),
          ...EDIT_REQUEST_FLAGS,
          width,
          height,
          n_samples: 1,
          strength: level.strength,
          noise: level.noise,
          add_original_image: true,
          inpaintImg2ImgStrength: 0,
          seed,
          extra_noise_seed: extraNoiseSeed,
          image: imageB64,
          color_correct: false,
        },
      });

      // Delegate to useGenerate — handles streaming/non-streaming transparently
      // Create a fresh object URL for the source image so the enhanced image can
      // display it even if the source is later removed from the session.
      const sourceImageUrl = URL.createObjectURL(image.blob);
      return await generate(request, { sourceImageId: image.id, sourceImageUrl, wildcardPicks: resolved.picks, source: promptSource(form, resolved) });
    } catch (err) {
      // blobToBase64 failures land here; API errors are handled by generate()
      console.error('Enhance setup error:', err);
      return null;
    } finally {
      setIsEnhancing(false);
      setIsLoading(false);
    }
  };

  return { enhance, isEnhancing, error, clearError };
}
