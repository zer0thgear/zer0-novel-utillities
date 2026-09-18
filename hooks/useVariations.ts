import { useState } from 'react';
import { useGenerate } from '@/hooks/useGenerate';
import { useSessionStore } from '@/store/sessionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { GeneratedImage } from '@/types/novelai';
import { resolveRequestPrompts } from '@/lib/wildcards';
import { buildImageRequest, EDIT_REQUEST_FLAGS, randomSeed } from '@/lib/imageRequest';
import { blobToBase64 } from '@/lib/imageUtils';

// Matches NovelAI's own "Generate Variations" request: img2img at strength 0.8 /
// noise 0.1 with a fresh seed, producing several samples in one batch.
export const VARIATION_COUNT = 3;
const VARIATION_STRENGTH = 0.8;
const VARIATION_NOISE = 0.1;

interface UseVariationsReturn {
  generateVariations: (image: GeneratedImage) => Promise<boolean>;
  isGeneratingVariations: boolean;
  error: string | null;
  clearError: () => void;
}

export function useVariations(): UseVariationsReturn {
  const [isGeneratingVariations, setIsGeneratingVariations] = useState(false);
  const { generate, error, clearError } = useGenerate();
  const { setIsLoading } = useSessionStore();
  const form = useSettingsStore();

  const generateVariations = async (image: GeneratedImage): Promise<boolean> => {
    setIsGeneratingVariations(true);
    setIsLoading(true);

    try {
      const imageB64 = await blobToBase64(image.blob);
      // Base prompt and negatives come from the image itself (already rolled);
      // characters come from the current form, replaying the image's rolls.
      const resolved = resolveRequestPrompts({ text: '' }, form.characters, '', form.tidbitLibrary, image.wildcardPicks);
      const seed = randomSeed();
      const extraNoiseSeed = randomSeed();

      // Settings come from the image itself, not the current form.
      const p = image.parameters;
      const request = buildImageRequest({
        input: image.prompt,
        negativePrompt: image.negativePrompt,
        model: image.model,
        action: 'img2img',
        characters: resolved.characters,
        useCoords: form.useCoords,
        // The image's own preset levels, when this app made it.
        presets: image.source
          ? { quality: image.source.modifiers.qualityPreset, uc: image.source.modifiers.ucPreset }
          : undefined,
        parameters: {
          ...EDIT_REQUEST_FLAGS,
          params_version: p.params_version,
          width: p.width,
          height: p.height,
          scale: p.scale,
          sampler: p.sampler,
          steps: p.steps,
          n_samples: VARIATION_COUNT,
          strength: VARIATION_STRENGTH,
          noise: VARIATION_NOISE,
          add_original_image: true,
          cfg_rescale: p.cfg_rescale,
          noise_schedule: p.noise_schedule,
          skip_cfg_above_sigma: p.skip_cfg_above_sigma,
          inpaintImg2ImgStrength: 0,
          seed,
          extra_noise_seed: extraNoiseSeed,
          image: imageB64,
          color_correct: false,
        },
      });

      const sourceImageUrl = URL.createObjectURL(image.blob);
      return await generate(request, {
        sourceImageId: image.id,
        sourceImageUrl,
        forceStandard: true,
        // Keep the source's base-prompt rolls alongside the characters' so a
        // variation can itself be enhanced without re-rolling.
        wildcardPicks: { ...image.wildcardPicks, ...resolved.picks },
        source: image.source,
      });
    } catch (err) {
      console.error('Variations setup error:', err);
      return false;
    } finally {
      setIsGeneratingVariations(false);
      setIsLoading(false);
    }
  };

  return { generateVariations, isGeneratingVariations, error, clearError };
}
