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
  resolveSelectedPrompt,
} from '@/lib/imageRequest';
import { blobToBase64 } from '@/lib/imageUtils';

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseEditReturn {
  edit: (image: GeneratedImage, editedBlob: Blob, strength: number, noise: number) => Promise<boolean>;
  isEditing: boolean;
  error: string | null;
  clearError: () => void;
}

export function useEdit(): UseEditReturn {
  const [isEditing, setIsEditing] = useState(false);
  const { generate, error, clearError } = useGenerate();
  const { setIsLoading } = useSessionStore();
  const form = useSettingsStore();

  const edit = async (
    image: GeneratedImage,
    editedBlob: Blob,
    strength: number,
    noise: number,
  ): Promise<boolean> => {
    setIsEditing(true);
    setIsLoading(true);

    try {
      const imageB64 = await blobToBase64(editedBlob);

      // Replays the source image's wildcard rolls, so reworking it doesn't re-roll.
      const resolved = resolveSelectedPrompt(form, image.wildcardPicks);
      const { input, negativePrompt } = composeFinalPrompts(form, resolved);
      const seed = randomSeed();
      const extraNoiseSeed = randomSeed();

      const request = buildImageRequest({
        input,
        negativePrompt,
        model: form.model,
        action: 'img2img',
        characters: resolved.characters,
        useCoords: form.useCoords,
        parameters: {
          ...formSampling(form),
          ...EDIT_REQUEST_FLAGS,
          width: image.parameters.width,
          height: image.parameters.height,
          n_samples: 1,
          strength,
          noise,
          add_original_image: true,
          inpaintImg2ImgStrength: 0.69,
          seed,
          extra_noise_seed: extraNoiseSeed,
          image: imageB64,
          color_correct: false,
        },
      });

      const sourceImageUrl = URL.createObjectURL(image.blob);
      return await generate(request, { sourceImageId: image.id, sourceImageUrl, wildcardPicks: resolved.picks, source: promptSource(form, resolved) });
    } catch (err) {
      console.error('Edit setup error:', err);
      return false;
    } finally {
      setIsEditing(false);
      setIsLoading(false);
    }
  };

  return { edit, isEditing, error, clearError };
}
