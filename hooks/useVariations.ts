import { useState } from 'react';
import { useGenerate } from '@/hooks/useGenerate';
import { useSessionStore } from '@/store/sessionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { GeneratedImage } from '@/types/novelai';
import { resolveRequestPrompts } from '@/lib/wildcards';
import { buildImageRequest, EDIT_REQUEST_FLAGS, randomSeed } from '@/lib/imageRequest';
import { blobToBase64 } from '@/lib/imageUtils';
import { addMissingTags } from '@/lib/naiPresets';

// Matches NovelAI's own "Generate Variations" request: img2img at strength 0.8 /
// noise 0.1 with a fresh seed, producing several samples in one batch.
export const VARIATION_COUNT = 3;
export const VARIATION_STRENGTH = 0.8;
const VARIATION_NOISE = 0.1;

interface UseVariationsReturn {
  /** `extraTags` (from a chain's Add Tags step) go into this request only. */
  generateVariations: (image: GeneratedImage, extraTags?: string) => Promise<GeneratedImage[] | null>;
  isGeneratingVariations: boolean;
  error: string | null;
  clearError: () => void;
}

export function useVariations(): UseVariationsReturn {
  const [isGeneratingVariations, setIsGeneratingVariations] = useState(false);
  const { generate, error, clearError } = useGenerate();
  const { setIsLoading } = useSessionStore();
  const form = useSettingsStore();

  const generateVariations = async (image: GeneratedImage, extraTags?: string): Promise<GeneratedImage[] | null> => {
    setIsGeneratingVariations(true);
    setIsLoading(true);

    try {
      const imageB64 = await blobToBase64(image.blob);
      // Base prompt and negatives come from the image itself (already rolled);
      // characters come from the current form, replaying the image's rolls.
      const resolved = resolveRequestPrompts({ text: '' }, form.characters, '', form.tidbitLibrary, image.wildcardPicks);
      const seed = randomSeed();

      // Settings come from the image itself, not the current form.
      const p = image.parameters;
      // Extra tags the prompt lacks go where NovelAI puts quality tags, and
      // into the saved as-written prompt too, so Reuse brings them back.
      const input = extraTags ? addMissingTags(image.prompt, image.model, extraTags) : image.prompt;
      const source =
        extraTags && image.source
          ? { ...image.source, prompt: addMissingTags(image.source.prompt, image.model, extraTags) }
          : image.source;
      const request = buildImageRequest({
        input,
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
          // NovelAI reuses the source's own, if it has one (else seed − 1).
          extra_noise_seed: p.extra_noise_seed,
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
        source,
      });
    } catch (err) {
      console.error('Variations setup error:', err);
      return null;
    } finally {
      setIsGeneratingVariations(false);
      setIsLoading(false);
    }
  };

  return { generateVariations, isGeneratingVariations, error, clearError };
}
