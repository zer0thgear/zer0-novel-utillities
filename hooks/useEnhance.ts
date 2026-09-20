import { useState } from 'react';
import { useGenerate } from '@/hooks/useGenerate';
import { useSessionStore } from '@/store/sessionStore';
import { varietySigma } from '@/lib/variety';
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
import { addEnhancePrompt, ENHANCE_LEVELS, EnhanceLevelNum, EnhanceScale, enhanceRequestSize } from '@/lib/enhance';

// Levels, scales, sizes and the prompt addition live in lib/enhance.ts.

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseEnhanceReturn {
  /** `extraTags` (from a chain's Add Tags step) go into this request only. */
  enhance: (
    image: GeneratedImage,
    level: EnhanceLevelNum,
    scale: EnhanceScale,
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
    scale: EnhanceScale,
    extraTags?: string,
  ): Promise<GeneratedImage[] | null> => {
    setIsEnhancing(true);
    setIsLoading(true); // shows gallery progress indicator / streaming preview

    try {
      const level = ENHANCE_LEVELS[levelNum - 1];
      const imageB64 = await blobToBase64(image.blob);

      // NovelAI's sizes: plain multiplication, or the image's own size for Max.
      const { width, height } = enhanceRequestSize(image.parameters.width, image.parameters.height, scale);

      // Replays the source image's wildcard rolls, so reworking it doesn't re-roll.
      const rolled = resolveReworkPrompt(form, image);
      const resolved = extraTags ? { ...rolled, baseText: addMissingTags(rolled.baseText, form.model, extraTags) } : rolled;
      const composed = composeFinalPrompts(form, resolved);
      // On V4.5/V5, NovelAI nudges away from an upscaled, blurry look.
      const input = addEnhancePrompt(composed.input, form.model, scale);
      const { negativePrompt } = composed;
      const seed = randomSeed();

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
          // Variety+ scales with the size, and this renders at its own.
          skip_cfg_above_sigma: varietySigma(form.model, form.variety, width, height),
          n_samples: 1,
          strength: level.strength,
          noise: level.noise,
          add_original_image: true,
          inpaintImg2ImgStrength: 0,
          seed,
          image: imageB64,
          ...(scale === 'max' ? { upscaled_enhance: true } : {}),
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
