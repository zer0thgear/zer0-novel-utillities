import { useState } from 'react';
import { extractImagesFromZip } from '@/lib/imageUtils';
import { useSessionStore } from '@/store/sessionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { GeneratedImage, NovelAIGenerateRequest } from '@/types/novelai';

interface UseGenerateReturn {
  generate: (request: NovelAIGenerateRequest) => Promise<boolean>;
  error: string | null;
  clearError: () => void;
}

// Decode a base64 string to a Uint8Array, tolerating whitespace in the input
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function useGenerate(): UseGenerateReturn {
  const [error, setError] = useState<string | null>(null);
  const { apiKey, addImages, setStreamPreview } = useSessionStore();
  const streamingMode = useSettingsStore((s) => s.streamingMode);

  // ── Standard (non-streaming) generation ────────────────────────────────────

  const generateStandard = async (request: NovelAIGenerateRequest): Promise<boolean> => {
    setError(null);
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
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
      const images: GeneratedImage[] = blobs.map((blob, i) => ({
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

      addImages(images);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      return false;
    }
  };

  // ── Streaming (SSE) generation ─────────────────────────────────────────────

  const generateStreaming = async (request: NovelAIGenerateRequest): Promise<boolean> => {
    setError(null);
    try {
      const response = await fetch('/api/generate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: response.statusText }));
        if (response.status === 401) throw new Error('Invalid API key.');
        if (response.status === 402) throw new Error('Insufficient Anlas. Please top up your account.');
        if (response.status === 429) throw new Error('Rate limited. Please wait a moment and try again.');
        throw new Error(`Generation failed (${response.status}): ${data.error ?? ''}`);
      }

      if (!response.body) throw new Error('No response body from stream endpoint.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalImageAdded = false;

      // Process one parsed SSE event.
      //
      // NAI format (confirmed):
      //   event: intermediate          ← SSE event: field (lowercase)
      //   data: {"event_type":"intermediate","image":"<base64-JPEG>","step_ix":N,...}
      //
      //   event: final (or similar)
      //   data: {"event_type":"final","image":"<base64>"}
      //
      // The data field is always JSON. Image mime type is detected from magic bytes.
      const handleEvent = async (sseEventType: string, rawData: string) => {
        let eventType = sseEventType; // from SSE `event:` field
        let imageB64 = rawData;

        // Always try to parse the data as JSON — NAI wraps everything in JSON.
        try {
          const json = JSON.parse(rawData) as Record<string, unknown>;
          // event_type in JSON is the authoritative field; fall back to event or SSE header
          if (typeof json.event_type === 'string') eventType = json.event_type;
          else if (typeof json.event === 'string') eventType = json.event;
          // Image payload — check in order of known NAI field names
          const payload = json.image ?? json.response ?? json.data ?? json.frame;
          if (typeof payload === 'string') imageB64 = payload;
        } catch { /* not JSON — rawData is raw base64 */ }

        const isIntermediate =
          eventType === 'intermediate' ||
          eventType === 'StreamingEventTypeIntermediate' ||
          eventType === 'newToken';
        const isFinal =
          eventType === 'final' ||
          eventType === 'done' ||
          eventType === 'StreamingEventTypeFinal';
        const isError =
          eventType === 'error' ||
          eventType === 'StreamingEventTypeError';

        if (isIntermediate) {
          // Live preview frame — show it in the gallery placeholder
          try {
            const bytes = base64ToBytes(imageB64);
            // Detect JPEG (FF D8) vs PNG (89 50) from magic bytes
            const mime =
              bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : 'image/png';
            setStreamPreview(URL.createObjectURL(new Blob([bytes], { type: mime })));
          } catch { /* ignore malformed preview frames */ }

        } else if (isFinal) {
          // Completed image — detect ZIP (PK) vs JPEG (FF D8) vs PNG (89 50)
          const bytes = base64ToBytes(imageB64);
          let imageBlob: Blob;

          if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
            // ZIP: extract the image inside
            const blobs = await extractImagesFromZip(bytes.buffer);
            imageBlob = blobs[0];
          } else {
            const mime =
              bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : 'image/png';
            imageBlob = new Blob([bytes], { type: mime });
          }

          addImages([{
            id: crypto.randomUUID(),
            url: URL.createObjectURL(imageBlob),
            blob: imageBlob,
            prompt: request.input,
            negativePrompt: request.parameters.negative_prompt,
            model: request.model,
            parameters: request.parameters,
            timestamp: Date.now(),
            seed: request.parameters.seed,
          }]);
          finalImageAdded = true;
          setStreamPreview(null);

        } else if (isError) {
          throw new Error(`Stream error: ${rawData}`);
        }
        // Unknown / keep-alive events are silently ignored
      };

      // Read the SSE stream chunk by chunk
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by a blank line (\n\n or \r\n\r\n)
        const parts = buffer.split(/\n\n|\r\n\r\n/);
        buffer = parts.pop() ?? ''; // keep the incomplete trailing chunk

        for (const part of parts) {
          if (!part.trim()) continue;
          let eventType = 'message';
          const dataLines: string[] = [];

          for (const line of part.split(/\r?\n/)) {
            if (line.startsWith('event:')) eventType = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
          }

          if (dataLines.length > 0) {
            await handleEvent(eventType, dataLines.join('\n'));
          }
        }
      }

      if (!finalImageAdded) {
        // The stream closed without a recognised final event.
        // Surface as an error so the user knows something went wrong.
        throw new Error('Stream closed without delivering a final image. Check the browser console for raw SSE output.');
      }
      return true;
    } catch (err) {
      setStreamPreview(null);
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      return false;
    }
  };

  // ── Public generate function ────────────────────────────────────────────────

  const generate = async (request: NovelAIGenerateRequest): Promise<boolean> => {
    if (!apiKey) {
      setError('No API key set. Please enter your NovelAI API key.');
      return false;
    }
    return streamingMode ? generateStreaming(request) : generateStandard(request);
  };

  return { generate, error, clearError: () => setError(null) };
}
