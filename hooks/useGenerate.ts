import { useState } from 'react';
import { extractImagesFromZip } from '@/lib/imageUtils';
import { useSessionStore } from '@/store/sessionStore';
import { GeneratedImage, NovelAIGenerateRequest } from '@/types/novelai';

interface UseGenerateReturn {
  generate: (request: NovelAIGenerateRequest) => Promise<boolean>;
  error: string | null;
  clearError: () => void;
}

export function useGenerate(): UseGenerateReturn {
  const [error, setError] = useState<string | null>(null);
  const { apiKey, addImages } = useSessionStore();

  // Returns true on success, false on error.
  // Loading state is managed by the caller (PromptForm) so batch generation
  // can keep isLoading=true across multiple sequential calls.
  const generate = async (request: NovelAIGenerateRequest): Promise<boolean> => {
    if (!apiKey) {
      setError('No API key set. Please enter your NovelAI API key.');
      return false;
    }

    setError(null);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: response.statusText }));
        if (response.status === 401) throw new Error('Invalid API key.');
        if (response.status === 402) throw new Error('Insufficient Anlas. Please top up your account.');
        if (response.status === 429) throw new Error('Rate limited. Please wait a moment and try again.');
        throw new Error(`Generation failed (${response.status}): ${data.error ?? ''}`);
      }

      const buffer = await response.arrayBuffer();
      const blobs = await extractImagesFromZip(buffer);

      const now = Date.now();
      const generatedImages: GeneratedImage[] = blobs.map((blob, i) => ({
        id: crypto.randomUUID(),
        url: URL.createObjectURL(blob),
        blob,
        prompt: request.input,
        negativePrompt: request.parameters.negative_prompt,
        model: request.model,
        parameters: request.parameters,
        timestamp: now + i,
        seed: request.parameters.seed + i,
      }));

      addImages(generatedImages);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      return false;
    }
  };

  return { generate, error, clearError: () => setError(null) };
}
