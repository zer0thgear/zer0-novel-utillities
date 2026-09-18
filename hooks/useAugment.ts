import { useState } from 'react';
import { extractSingleImageResponse, getImageDimensions } from '@/lib/imageUtils';
import { useSessionStore } from '@/store/sessionStore';
import { AugmentReqType, AugmentRequest, GeneratedImage } from '@/types/novelai';

interface AugmentOptions {
  prompt?: string;
  defry?: number;
}

interface UseAugmentReturn {
  augment: (image: GeneratedImage, reqType: AugmentReqType, options?: AugmentOptions) => Promise<GeneratedImage[] | null>;
  isAugmenting: boolean;
  error: string | null;
  clearError: () => void;
}

export function useAugment(): UseAugmentReturn {
  const [isAugmenting, setIsAugmenting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { apiKey, addImages, setIsLoading } = useSessionStore();

  const augment = async (
    image: GeneratedImage,
    reqType: AugmentReqType,
    options?: AugmentOptions,
  ): Promise<GeneratedImage[] | null> => {
    if (!apiKey) {
      setError('No API key set. Please enter your NovelAI API key.');
      return null;
    }

    setIsAugmenting(true);
    setIsLoading(true);
    setError(null);

    try {
      const request: AugmentRequest = {
        req_type: reqType,
        use_new_shared_trial: false, // pay normally — skips the recaptcha_token requirement
        width: image.parameters.width,
        height: image.parameters.height,
        image: 'image',
        ...(options?.prompt !== undefined ? { prompt: options.prompt } : {}),
        ...(options?.defry !== undefined ? { defry: options.defry } : {}),
      };

      const formData = new FormData();
      formData.append('image', image.blob, 'image.png');
      formData.append('request', new Blob([JSON.stringify(request)], { type: 'application/json' }));

      const response = await fetch('https://image.novelai.net/ai/augment-image', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        if (response.status === 401) throw new Error('Invalid API key.');
        if (response.status === 402) throw new Error('Insufficient Anlas. Please top up your account.');
        if (response.status === 429) throw new Error('Rate limited. Please wait a moment and try again.');
        throw new Error(`${reqType} failed (${response.status}): ${text}`);
      }

      const resultBlob = await extractSingleImageResponse(
        await response.arrayBuffer(),
        response.headers.get('content-type'),
      );
      const { width, height } = await getImageDimensions(resultBlob);
      const sourceImageUrl = URL.createObjectURL(image.blob);

      const result: GeneratedImage = {
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

      addImages([result]);
      return [result];
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      return null;
    } finally {
      setIsAugmenting(false);
      setIsLoading(false);
    }
  };

  return { augment, isAugmenting, error, clearError: () => setError(null) };
}
