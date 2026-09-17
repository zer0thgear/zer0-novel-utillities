import { NovelAIModel } from '@/types/novelai';

// NovelAI embeds generation metadata directly in PNG tEXt chunks on every
// image its server returns (confirmed 2026-09-17 by reading the raw bytes of
// an image this app itself generated — see memory/project_novelai_metadata.md):
//   Title, Description (= the composed positive prompt), Software ("NovelAI"),
//   Source (e.g. "NovelAI Diffusion V5 0ADF9AB7"), Generation_time, and
//   Comment — a JSON blob with the full generation parameters, including the
//   same v4_prompt/v4_negative_prompt caption structure this codebase already
//   builds requests with.

export interface ParsedCharacter {
  prompt: string;
  center: { x: number; y: number };
}

export interface ParsedNaiMetadata {
  prompt: string;
  negativePrompt: string;
  characters: ParsedCharacter[];
  seed: number;
  steps: number;
  scale: number;
  width: number;
  height: number;
  sampler?: string;
  noiseSchedule?: string;
  smea: boolean;
  smeaDyn: boolean;
  cfgRescale: number;
  /** Best-effort guess from the "Source"/model_name text — NOT authoritative,
   *  the metadata doesn't distinguish Full vs Curated. `undefined` if no
   *  confident guess could be made; callers should leave the current model
   *  selection untouched in that case rather than silently picking one. */
  guessedModel?: NovelAIModel;
}

function readPngTextChunks(bytes: Uint8Array): Record<string, string> {
  const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return {};
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder('latin1');
  const out: Record<string, string> = {};
  let offset = 8;

  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const dataStart = offset + 8;
    if (dataStart + length > bytes.length) break;

    if (type === 'tEXt') {
      const raw = bytes.slice(dataStart, dataStart + length);
      const nullIdx = raw.indexOf(0);
      if (nullIdx >= 0) {
        out[decoder.decode(raw.slice(0, nullIdx))] = decoder.decode(raw.slice(nullIdx + 1));
      }
    }
    // iTXt (UTF-8, possibly compressed) isn't produced by NovelAI's own
    // server as of this writing, so it's intentionally not handled here.

    offset = dataStart + length + 4; // skip CRC
    if (type === 'IEND') break;
  }

  return out;
}

function guessModel(sourceOrModelName: string | undefined): NovelAIModel | undefined {
  if (!sourceOrModelName) return undefined;
  const s = sourceOrModelName.toLowerCase();
  if (s.includes('furry')) return 'nai-diffusion-furry-3';
  if (s.includes('v5')) return 'nai-diffusion-5-full';
  if (s.includes('v4.5') || s.includes('4-5')) return 'nai-diffusion-4-5-full';
  if (s.includes('v4')) return 'nai-diffusion-4-full-preview';
  if (s.includes('v3') || s.includes('diffusion 3')) return 'nai-diffusion-3';
  return undefined;
}

export function extractNaiMetadata(buffer: ArrayBuffer): ParsedNaiMetadata | null {
  const bytes = new Uint8Array(buffer);
  const chunks = readPngTextChunks(bytes);
  if (!chunks.Comment) return null;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(chunks.Comment);
  } catch {
    return null;
  }

  const num = (v: unknown, fallback: number) => (typeof v === 'number' ? v : fallback);
  const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);

  const v4Prompt = data.v4_prompt as { caption?: { base_caption?: string; char_captions?: { char_caption: string; centers: { x: number; y: number }[] }[] } } | undefined;
  const charCaptions = v4Prompt?.caption?.char_captions ?? [];

  return {
    prompt: str(data.prompt, str(v4Prompt?.caption?.base_caption, '')),
    negativePrompt: str(data.uc, ''),
    characters: charCaptions
      .filter((c) => c.char_caption?.trim())
      .map((c) => ({ prompt: c.char_caption, center: c.centers?.[0] ?? { x: 0.5, y: 0.5 } })),
    seed: num(data.seed, 0),
    steps: num(data.steps, 28),
    scale: num(data.scale, 6),
    width: num(data.width, 832),
    height: num(data.height, 1216),
    sampler: typeof data.sampler === 'string' ? data.sampler : undefined,
    noiseSchedule: typeof data.noise_schedule === 'string' ? data.noise_schedule : undefined,
    smea: data.sm === true,
    smeaDyn: data.sm_dyn === true,
    cfgRescale: num(data.cfg_rescale, 0),
    guessedModel: guessModel(str(data.model_name, chunks.Source)),
  };
}

/** Raw chunk text, for a metadata-inspection view (item 7) — includes fields
 *  extractNaiMetadata() doesn't surface (Title, Software, Source, Generation_time,
 *  and the full unparsed Comment JSON). */
export function extractRawPngText(buffer: ArrayBuffer): Record<string, string> {
  return readPngTextChunks(new Uint8Array(buffer));
}
