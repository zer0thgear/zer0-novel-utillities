import { useState } from 'react';
import { useGenerate } from '@/hooks/useGenerate';
import { useSessionStore } from '@/store/sessionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { GeneratedImage, NovelAIGenerateRequest } from '@/types/novelai';
import { composeWithTidbits } from '@/lib/promptTidbits';

// Matches NovelAI's own "Generate Variations" request: img2img at strength 0.8 /
// noise 0.1 with a fresh seed, producing several samples in one batch.
const VARIATION_COUNT = 3;
const VARIATION_STRENGTH = 0.8;
const VARIATION_NOISE = 0.1;

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

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
      const activeCharacters = form.characters.filter((c) => c.enabled);
      const charPrompt = (c: (typeof activeCharacters)[number]) => composeWithTidbits(c.prompt, c.tidbits);
      const seed = Math.floor(Math.random() * 4294967295);
      const extraNoiseSeed = Math.floor(Math.random() * 4294967295);

      const p = image.parameters;
      const request: NovelAIGenerateRequest = {
        input: image.prompt,
        model: image.model,
        action: 'img2img',
        parameters: {
          params_version: p.params_version,
          width: p.width,
          height: p.height,
          scale: p.scale,
          sampler: p.sampler,
          steps: p.steps,
          n_samples: VARIATION_COUNT,
          strength: VARIATION_STRENGTH,
          noise: VARIATION_NOISE,
          ucPreset: p.ucPreset,
          qualityToggle: p.qualityToggle,
          autoSmea: false,
          sm: false,
          sm_dyn: false,
          dynamic_thresholding: false,
          controlnet_strength: 1,
          legacy: false,
          legacy_v3_extend: false,
          add_original_image: true,
          cfg_rescale: p.cfg_rescale,
          noise_schedule: p.noise_schedule,
          skip_cfg_above_sigma: p.skip_cfg_above_sigma,
          use_coords: form.useCoords,
          normalize_reference_strength_multiple: true,
          inpaintImg2ImgStrength: 0,
          seed,
          extra_noise_seed: extraNoiseSeed,
          image: imageB64,
          color_correct: false,
          deliberate_euler_ancestral_bug: false,
          prefer_brownian: true,
          negative_prompt: image.negativePrompt,
          legacy_uc: false,
          reference_image_multiple: [],
          reference_information_extracted_multiple: [],
          reference_strength_multiple: [],
          v4_prompt: {
            caption: {
              base_caption: image.prompt,
              char_captions: activeCharacters.map((c) => ({
                char_caption: charPrompt(c),
                centers: [c.center],
              })),
            },
            use_coords: form.useCoords,
            use_order: true,
          },
          v4_negative_prompt: {
            caption: {
              base_caption: image.negativePrompt,
              char_captions: activeCharacters.map((c) => ({
                char_caption: c.uc,
                centers: [c.center],
              })),
            },
            legacy_uc: false,
          },
          characterPrompts: activeCharacters.map((c) => ({
            prompt: charPrompt(c),
            uc: c.uc,
            center: c.center,
            enabled: c.enabled,
          })),
        },
      };

      const sourceImageUrl = URL.createObjectURL(image.blob);
      return await generate(request, {
        sourceImageId: image.id,
        sourceImageUrl,
        forceStandard: true,
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
