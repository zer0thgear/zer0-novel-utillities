import { useGenerate } from '@/hooks/useGenerate';
import { useSessionStore } from '@/store/sessionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { CharacterPromptEntry, GeneratedImage, NovelAIModel } from '@/types/novelai';
import { buildImageRequest, composeFinalPrompts, isV3Model } from '@/lib/imageRequest';
import { insertTags } from '@/lib/naiPresets';
import { joinPromptParts } from '@/lib/promptText';
import { axisInfo, SweepAxisDraft, sweepCells, toAxis } from '@/lib/sweeps';

// A chain's Sweep step: "what if this image had X instead?". Each cell is a
// fresh text-to-image generation from the image's own prompt (as written,
// re-composed with its modifiers), seed, size and settings, with the swept
// values changed. Queued one at a time, like a normal sweep.

const CELL_GAP_MS = 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Inpainting results regenerate with the base model. */
const textModel = (model: NovelAIModel) => model.replace(/-inpainting$/, '') as NovelAIModel;

interface SweepAroundOptions {
  /** Checked before each cell. */
  shouldStop: () => boolean;
  onCell?: (index: number, total: number) => void;
}

export function useSweepAround() {
  const { generate, error, clearError } = useGenerate();
  const { setIsLoading } = useSessionStore();
  const useCoordsDefault = useSettingsStore((s) => s.useCoords);

  /** The sweep's images, or null if a request failed (images made before
   *  the failure stay in history as their own sweep). */
  const sweepAround = async (
    image: GeneratedImage,
    xDraft: SweepAxisDraft,
    yDraft: SweepAxisDraft,
    extraTags: string,
    { shouldStop, onCell }: SweepAroundOptions,
  ): Promise<GeneratedImage[] | null> => {
    const x = toAxis(xDraft).axis;
    const y = toAxis(yDraft).axis;
    if (!x) return null;
    const cells = sweepCells(x, y);
    const xInfo = axisInfo(x, []);
    const yInfo = y ? axisInfo(y, []) : undefined;
    const sweepId = crypto.randomUUID();
    const model = textModel(image.model);
    const p = image.parameters;
    const characters: CharacterPromptEntry[] = (p.characterPrompts ?? []).map((c) => ({
      ...c,
      id: crypto.randomUUID(),
      enabled: true,
    }));
    const made: GeneratedImage[] = [];

    setIsLoading(true);
    try {
      for (let i = 0; i < cells.length; i++) {
        if (shouldStop()) break;
        onCell?.(i + 1, cells.length);
        const cell = cells[i];
        const tags = joinPromptParts(extraTags, cell.tags);

        // Re-compose from the prompt as written when this app made the image,
        // so an Enhance result's additions don't carry over; otherwise the
        // text actually sent.
        let input: string;
        let negativePrompt: string;
        let source = image.source;
        if (image.source) {
          const baseText = tags ? insertTags(image.source.prompt, model, tags) : image.source.prompt;
          ({ input, negativePrompt } = composeFinalPrompts(
            { ...image.source.modifiers, model },
            { baseText, negativePrompt: image.source.negativePrompt, characters: [], picks: {} },
          ));
          source = { ...image.source, prompt: baseText };
        } else {
          input = tags ? insertTags(image.prompt, model, tags) : image.prompt;
          negativePrompt = image.negativePrompt;
        }

        const request = buildImageRequest({
          input,
          negativePrompt,
          model,
          action: 'generate',
          characters,
          useCoords: p.v4_prompt?.use_coords ?? p.use_coords ?? useCoordsDefault,
          presets: image.source
            ? { quality: image.source.modifiers.qualityPreset, uc: image.source.modifiers.ucPreset }
            : undefined,
          parameters: {
            params_version: p.params_version,
            width: p.width,
            height: p.height,
            scale: cell.scale ?? p.scale,
            sampler: cell.sampler ?? p.sampler,
            steps: cell.steps ?? p.steps,
            cfg_rescale: cell.cfgRescale ?? p.cfg_rescale,
            noise_schedule: p.noise_schedule,
            skip_cfg_above_sigma: p.skip_cfg_above_sigma,
            ...(isV3Model(model) ? { sm: p.sm ?? false, sm_dyn: p.sm_dyn ?? false } : { inpaintImg2ImgStrength: 1 }),
            n_samples: 1,
            add_original_image: true,
            seed: cell.seed ?? image.seed,
          },
        });

        const result = await generate(request, {
          batchId: sweepId,
          wildcardPicks: image.wildcardPicks,
          source,
          sweep: { id: sweepId, x: xInfo, xIndex: cell.xIndex, y: yInfo, yIndex: cell.yIndex },
        });
        if (!result) return null;
        made.push(...result);
        if (i < cells.length - 1 && !shouldStop()) await sleep(CELL_GAP_MS);
      }
      return made;
    } finally {
      setIsLoading(false);
    }
  };

  return { sweepAround, error, clearError };
}
