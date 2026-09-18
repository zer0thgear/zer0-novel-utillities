import { useState } from 'react';
import { getImageDimensions } from '@/lib/imageUtils';
import { pixelSnap, PixelSnapOptions } from '@/lib/pixelSnap';
import { useSessionStore } from '@/store/sessionStore';
import { GeneratedImage } from '@/types/novelai';

interface UsePixelSnapReturn {
  snap: (image: GeneratedImage, options: PixelSnapOptions) => Promise<GeneratedImage[] | null>;
  isSnapping: boolean;
  error: string | null;
  clearError: () => void;
}

// Pure client-side filter — no network call, no Anlas cost, no API key needed.
// See lib/pixelSnap.ts for why: NovelAI's own Pixel Snap never touches the network either.
export function usePixelSnap(): UsePixelSnapReturn {
  const [isSnapping, setIsSnapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addImages, setIsLoading } = useSessionStore();

  const snap = async (image: GeneratedImage, options: PixelSnapOptions): Promise<GeneratedImage[] | null> => {
    setIsSnapping(true);
    setIsLoading(true);
    setError(null);

    try {
      const resultBlob = await pixelSnap(image.blob, options);
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
      setIsSnapping(false);
      setIsLoading(false);
    }
  };

  return { snap, isSnapping, error, clearError: () => setError(null) };
}
