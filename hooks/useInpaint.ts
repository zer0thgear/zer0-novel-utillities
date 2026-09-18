import { useState } from 'react';
import { useGenerate } from '@/hooks/useGenerate';
import { useSessionStore } from '@/store/sessionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { GeneratedImage, NovelAIModel } from '@/types/novelai';
import {
  buildImageRequest,
  composeFinalPrompts,
  EDIT_REQUEST_FLAGS,
  formSampling,
  randomSeed,
  resolveSelectedPrompt,
} from '@/lib/imageRequest';
import { blobToBase64 } from '@/lib/imageUtils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toInpaintingModel(model: NovelAIModel): NovelAIModel {
  if (model.endsWith('-inpainting')) return model;
  return `${model}-inpainting` as NovelAIModel;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseInpaintReturn {
  inpaint: (image: GeneratedImage, maskBlob: Blob, strength: number) => Promise<boolean>;
  isInpainting: boolean;
  error: string | null;
  clearError: () => void;
}

export function useInpaint(): UseInpaintReturn {
  const [isInpainting, setIsInpainting] = useState(false);
  const { generate, error, clearError } = useGenerate();
  const { setIsLoading } = useSessionStore();
  const form = useSettingsStore();

  const inpaint = async (
    image: GeneratedImage,
    maskBlob: Blob,
    strength: number,
  ): Promise<boolean> => {
    setIsInpainting(true);
    setIsLoading(true);

    try {
      const imageB64 = await blobToBase64(image.blob);
      const maskB64 = await blobToBase64(maskBlob);

      // Replays the source image's wildcard rolls, so reworking it doesn't re-roll.
      const resolved = resolveSelectedPrompt(form, image.wildcardPicks);
      const { input, negativePrompt } = composeFinalPrompts(form, resolved);
      const seed = randomSeed();
      const extraNoiseSeed = randomSeed();

      const request = buildImageRequest({
        input,
        negativePrompt,
        model: toInpaintingModel(form.model),
        action: 'infill',
        characters: resolved.characters,
        useCoords: form.useCoords,
        parameters: {
          ...formSampling(form),
          ...EDIT_REQUEST_FLAGS,
          width: image.parameters.width,
          height: image.parameters.height,
          n_samples: 1,
          strength,
          noise: 0,
          add_original_image: false,
          inpaintImg2ImgStrength: 0.69,
          seed,
          extra_noise_seed: extraNoiseSeed,
          image: imageB64,
          mask: maskB64,
          img2img: { strength: 0.69, color_correct: true },
          color_correct: true,
        },
      });

      const sourceImageUrl = URL.createObjectURL(image.blob);
      return await generate(request, { sourceImageId: image.id, sourceImageUrl, wildcardPicks: resolved.picks });
    } catch (err) {
      console.error('Inpaint setup error:', err);
      return false;
    } finally {
      setIsInpainting(false);
      setIsLoading(false);
    }
  };

  return { inpaint, isInpainting, error, clearError };
}
