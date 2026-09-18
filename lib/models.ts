import { NovelAIModel } from '@/types/novelai';

export const MODELS: { value: NovelAIModel; label: string }[] = [
  { value: 'nai-diffusion-5-full', label: 'NAI Diffusion V5 Full' },
  { value: 'nai-diffusion-5-curated', label: 'NAI Diffusion V5 Curated' },
  { value: 'nai-diffusion-4-5-full', label: 'NAI Diffusion V4.5 Full' },
  { value: 'nai-diffusion-4-5-curated', label: 'NAI Diffusion V4.5 Curated' },
  { value: 'nai-diffusion-4-curated-preview', label: 'NAI Diffusion V4 Curated' },
  { value: 'nai-diffusion-4-full', label: 'NAI Diffusion V4 Full' },
  { value: 'nai-diffusion-3', label: 'NAI Diffusion V3 (Anime)' },
  { value: 'nai-diffusion-furry-3', label: 'NAI Diffusion V3 (Furry)' },
];

/** The picker label without the "NAI Diffusion" prefix, e.g. "V5 Full". */
export function modelShortName(model: NovelAIModel): string {
  const label = MODELS.find((m) => m.value === model)?.label ?? model;
  return label.replace(/^NAI Diffusion /, '');
}
