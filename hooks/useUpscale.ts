import { useState } from 'react';
import { fetchWithRetry, novelAIError } from '@/lib/apiRetry';
import { extractSingleImageResponse, getImageDimensions } from '@/lib/imageUtils';
import { useSessionStore } from '@/store/sessionStore';
import { GeneratedImage, UpscaleRequest } from '@/types/novelai';

interface UseUpscaleReturn {
  upscale: (image: GeneratedImage) => Promise<GeneratedImage[] | null>;
  isUpscaling: boolean;
  error: string | null;
  clearError: () => void;
}

export function useUpscale(): UseUpscaleReturn {
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { apiKey, addImages, setIsLoading, setRetryNotice } = useSessionStore();

  const upscale = async (image: GeneratedImage): Promise<GeneratedImage[] | null> => {
    if (!apiKey) {
      setError('No API key set. Please enter your NovelAI API key.');
      return null;
    }

    setIsUpscaling(true);
    setIsLoading(true);
    setError(null);

    try {
      const request: UpscaleRequest = {
        image: 'image',
        model: 'nai-diffusion-5-curated',
        declared_blur_sigma: 0,
      };

      const formData = new FormData();
      formData.append('image', image.blob, 'image.png');
      formData.append('request', new Blob([JSON.stringify(request)], { type: 'application/json' }));

      const response = await fetchWithRetry(
        'https://image.novelai.net/ai/upscale',
        { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: formData },
        { onRetry: ({ attempt, of, waitMs, reason }) => setRetryNotice(`${reason} — retrying in ${Math.round(waitMs / 1000)}s (${attempt}/${of})`) },
      );
      setRetryNotice(null);

      if (!response.ok) throw await novelAIError(response, 'Upscale');

      const resultBlob = await extractSingleImageResponse(
        await response.arrayBuffer(),
        response.headers.get('content-type'),
      );
      const { width, height } = await getImageDimensions(resultBlob);
      const sourceImageUrl = URL.createObjectURL(image.blob);

      const upscaled: GeneratedImage = {
        id: crypto.randomUUID(),
        url: URL.createObjectURL(resultBlob),
        blob: resultBlob,
        prompt: image.prompt,
        negativePrompt: image.negativePrompt,
        model: image.model,
        parameters: { ...image.parameters, width, height },
        source: image.source,
        wildcardPicks: image.wildcardPicks,
        timestamp: Date.now(),
        seed: image.seed,
        sourceImageId: image.id,
        sourceImageUrl,
      };

      addImages([upscaled]);
      return [upscaled];
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      return null;
    } finally {
      setIsUpscaling(false);
      setIsLoading(false);
    }
  };

  return { upscale, isUpscaling, error, clearError: () => setError(null) };
}
