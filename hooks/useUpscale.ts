import { useState } from 'react';
import { extractSingleImageResponse, getImageDimensions } from '@/lib/imageUtils';
import { useSessionStore } from '@/store/sessionStore';
import { GeneratedImage, UpscaleRequest } from '@/types/novelai';

interface UseUpscaleReturn {
  upscale: (image: GeneratedImage) => Promise<boolean>;
  isUpscaling: boolean;
  error: string | null;
  clearError: () => void;
}

export function useUpscale(): UseUpscaleReturn {
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { apiKey, addImages, setIsLoading } = useSessionStore();

  const upscale = async (image: GeneratedImage): Promise<boolean> => {
    if (!apiKey) {
      setError('No API key set. Please enter your NovelAI API key.');
      return false;
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

      const response = await fetch('https://image.novelai.net/ai/upscale', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        if (response.status === 401) throw new Error('Invalid API key.');
        if (response.status === 402) throw new Error('Insufficient Anlas. Please top up your account.');
        if (response.status === 429) throw new Error('Rate limited. Please wait a moment and try again.');
        throw new Error(`Upscale failed (${response.status}): ${text}`);
      }

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
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      return false;
    } finally {
      setIsUpscaling(false);
      setIsLoading(false);
    }
  };

  return { upscale, isUpscaling, error, clearError: () => setError(null) };
}
