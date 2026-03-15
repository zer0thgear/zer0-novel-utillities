import { useState } from 'react';
import { useGenerate } from '@/hooks/useGenerate';
import { useSessionStore } from '@/store/sessionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { GeneratedImage, NovelAIGenerateRequest } from '@/types/novelai';

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

      // ── Prompt assembly ────────────────────────────────────────────────────
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
          baseText.includes('Text:') ||
          activeCharacters.some((c) => c.prompt.includes('Text:'));
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
          width: image.parameters.width,
          height: image.parameters.height,
          scale: form.scale,
          sampler: form.sampler,
          steps: form.steps,
          n_samples: 1,
          strength,
          noise,
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
          inpaintImg2ImgStrength: 0.69,
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

      const sourceImageUrl = URL.createObjectURL(image.blob);
      return await generate(request, { sourceImageId: image.id, sourceImageUrl });
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
