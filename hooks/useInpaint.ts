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
  promptSource,
  randomSeed,
  resolveReworkPrompt,
} from '@/lib/imageRequest';
import { blobToBase64 } from '@/lib/imageUtils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** NovelAI's own base → inpainting model mapping. Not a simple suffix: V4
 *  Curated drops "-preview", and V5 Curated has no inpainting model of its
 *  own, so NovelAI's client uses V4.5 Curated's (both checked against the
 *  API on 2026-09-18). */
const INPAINTING_MODEL: Partial<Record<NovelAIModel, NovelAIModel>> = {
  'nai-diffusion-5-full': 'nai-diffusion-5-full-inpainting',
  'nai-diffusion-5-curated': 'nai-diffusion-4-5-curated-inpainting',
  'nai-diffusion-4-5-full': 'nai-diffusion-4-5-full-inpainting',
  'nai-diffusion-4-5-curated': 'nai-diffusion-4-5-curated-inpainting',
  'nai-diffusion-4-full': 'nai-diffusion-4-full-inpainting',
  'nai-diffusion-4-curated-preview': 'nai-diffusion-4-curated-inpainting',
  'nai-diffusion-3': 'nai-diffusion-3-inpainting',
  'nai-diffusion-furry-3': 'nai-diffusion-furry-3-inpainting',
};

function toInpaintingModel(model: NovelAIModel): NovelAIModel {
  if (model.endsWith('-inpainting')) return model;
  return INPAINTING_MODEL[model] ?? 'nai-diffusion-4-5-curated-inpainting';
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseInpaintReturn {
  inpaint: (image: GeneratedImage, maskBlob: Blob, strength: number) => Promise<GeneratedImage[] | null>;
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
  ): Promise<GeneratedImage[] | null> => {
    setIsInpainting(true);
    setIsLoading(true);

    try {
      const imageB64 = await blobToBase64(image.blob);
      const maskB64 = await blobToBase64(maskBlob);

      // Replays the source image's wildcard rolls, so reworking it doesn't re-roll.
      const resolved = resolveReworkPrompt(form, image);
      // Presets come from the model actually sent, as NovelAI does: V5 Curated
      // inpaints with V4.5 Curated's model, so it gets V4.5 Curated's presets
      // (verified against novelai.net's own request, 2026-09-18).
      const model = toInpaintingModel(form.model);
      const { input, negativePrompt } = composeFinalPrompts({ ...form, model }, resolved);
      const seed = randomSeed();
      const extraNoiseSeed = randomSeed();

      const request = buildImageRequest({
        input,
        negativePrompt,
        model,
        action: 'infill',
        characters: resolved.characters,
        useCoords: form.useCoords,
        presets: { quality: form.qualityPreset, uc: form.ucPreset },
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
      return await generate(request, { sourceImageId: image.id, sourceImageUrl, wildcardPicks: resolved.picks, source: promptSource(form, resolved) });
    } catch (err) {
      console.error('Inpaint setup error:', err);
      return null;
    } finally {
      setIsInpainting(false);
      setIsLoading(false);
    }
  };

  return { inpaint, isInpainting, error, clearError };
}
