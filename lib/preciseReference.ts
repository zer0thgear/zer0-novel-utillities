import { Effort, NovelAIModel, NovelAIParameters } from '@/types/novelai';

// Precise Reference (NovelAI's "director references"), as novelai.net's
// client does it (read 2026-11-24, the day V5 got it; see
// docs/REVERSE_ENGINEERING.md). Each reference is an image plus a type,
// sent as parallel `director_reference_*` arrays. V5 adds Outfit references
// and a "Prefer same outfit" switch, drops Fidelity, and lets Strength go to
// 5; V4.5 keeps Fidelity and also works while inpainting.

/** What a reference copies, as the request names it. The two `_mainoutfit`
 *  / `_anyoutfit` variants are V5's "Prefer same outfit" switch. */
export type ReferenceDescription =
  | 'character&style'
  | 'character&style_anyoutfit'
  | 'character'
  | 'character_mainoutfit'
  | 'style'
  | 'costume';

/** The type picked in the panel; the outfit switch picks the variant. */
export type ReferenceKind = 'characterAndStyle' | 'character' | 'style' | 'outfit';

export interface PreciseReference {
  id: string;
  /** The image as added, base64 (prepared for the model when sent). */
  data: string;
  /** A preview of it. */
  url: string;
  name: string;
  width: number;
  height: number;
  description: ReferenceDescription;
  strength: number;
  /** V4.5 only; V5 has no Fidelity, and sends as if it were 1. */
  fidelity: number;
  enabled: boolean;
}

/** NovelAI's limit on references per request. */
export const MAX_REFERENCES = 16;
/** Anlas per reference, per image made. */
export const REFERENCE_PRICE = 5;

/** A new reference, as NovelAI adds one. Its `information_extracted` is
 *  always 1 (the panel has no control for it). */
export const NEW_REFERENCE = {
  description: 'character&style',
  strength: 1,
  fidelity: 1,
  enabled: true,
} as const satisfies Partial<PreciseReference>;

export interface ReferenceCaps {
  /** Outfit references and the "Prefer same outfit" switch. */
  outfits: boolean;
  /** The Fidelity slider. */
  fidelity: boolean;
  /** References are also sent while inpainting. */
  inpainting: boolean;
  /** How far Strength goes (it starts at 0). */
  strengthMax: number;
  /** How the image is fitted to what the model takes: V5 crops it to the
   *  nearest of its sizes, V4.5 pads it onto one of three canvases. */
  fit: 'bucket' | 'letterbox';
}

/** NovelAI's model table: which models take references, and how. Medium
 *  effort inherits V5 Full's. Other models take none. */
export function referenceCaps(model: NovelAIModel): ReferenceCaps | null {
  if (model.startsWith('nai-diffusion-5')) {
    return { outfits: true, fidelity: false, inpainting: false, strengthMax: 5, fit: 'bucket' };
  }
  if (model.startsWith('nai-diffusion-4-5')) {
    return { outfits: false, fidelity: true, inpainting: true, strengthMax: 1, fit: 'letterbox' };
  }
  return null;
}

/**
 * The effort a V5 Full request really runs at. Medium takes no references,
 * so NovelAI runs High whenever any reference is set, even a disabled one.
 * An inpaint is the exception: V5 sends no references then, so Medium stays.
 */
export function effortWithReferences(effort: Effort, referenceCount: number, { inpainting = false } = {}): Effort {
  return effort === 'medium' && referenceCount > 0 && !inpainting ? 'high' : effort;
}

/** NovelAI's own wording, for the effort toggle while it's forced. */
export const EFFORT_FORCED_NOTE =
  'Precise Reference needs High effort. Remove your Precise Reference images to use Medium effort.';

// ─── Types and the outfit switch ─────────────────────────────────────────────

export function referenceKind(d: ReferenceDescription): ReferenceKind {
  switch (d) {
    case 'character&style':
    case 'character&style_anyoutfit':
      return 'characterAndStyle';
    case 'character':
    case 'character_mainoutfit':
      return 'character';
    case 'style':
      return 'style';
    case 'costume':
      return 'outfit';
  }
}

/** Picking a type in NovelAI's list sets these, so Character starts with
 *  Prefer same outfit off and Character & Style with it on. */
export const KIND_DESCRIPTION: Record<ReferenceKind, ReferenceDescription> = {
  characterAndStyle: 'character&style',
  character: 'character',
  style: 'style',
  outfit: 'costume',
};

/** Whether "Prefer same outfit" is on, for the two types that have it. */
export function prefersSameOutfit(d: ReferenceDescription): boolean | null {
  if (d === 'character&style' || d === 'character_mainoutfit') return true;
  if (d === 'character&style_anyoutfit' || d === 'character') return false;
  return null;
}

export function withSameOutfit(d: ReferenceDescription, on: boolean): ReferenceDescription {
  switch (referenceKind(d)) {
    case 'characterAndStyle':
      return on ? 'character&style' : 'character&style_anyoutfit';
    case 'character':
      return on ? 'character_mainoutfit' : 'character';
    default:
      return d;
  }
}

// ─── What gets sent ──────────────────────────────────────────────────────────

/**
 * The references a request on this model carries, as NovelAI's client
 * filters them: enabled ones only; none on a model without references, or
 * when inpainting on one that can't. Without outfit support, Outfit
 * references go and the outfit variants fall back to the plain types; without
 * Fidelity, it's sent as 1.
 */
export function referencesFor(
  references: readonly PreciseReference[],
  model: NovelAIModel,
  { inpainting = false }: { inpainting?: boolean } = {},
): PreciseReference[] {
  const caps = referenceCaps(model);
  if (!caps || (inpainting && !caps.inpainting)) return [];
  return references
    .filter((r) => r.enabled && (caps.outfits || r.description !== 'costume'))
    .map((r) => (caps.fidelity ? r : { ...r, fidelity: 1 }))
    .map((r) =>
      caps.outfits
        ? r
        : r.description === 'character_mainoutfit'
          ? { ...r, description: 'character' as const }
          : r.description === 'character&style_anyoutfit'
            ? { ...r, description: 'character&style' as const }
            : r,
    );
}

type ReferenceParameterKey =
  | 'director_reference_images'
  | 'director_reference_descriptions'
  | 'director_reference_information_extracted'
  | 'director_reference_strength_values'
  | 'director_reference_secondary_strength_values';

/** The request fields for these references (already filtered by
 *  referencesFor). The images go as added; finalizeRequest prepares them. */
export function referenceParameters(references: readonly PreciseReference[]): Pick<NovelAIParameters, ReferenceParameterKey> {
  return {
    director_reference_images: references.map((r) => r.data),
    director_reference_descriptions: references.map((r) => ({
      caption: { base_caption: r.description, char_captions: [] },
      legacy_uc: false,
    })),
    director_reference_information_extracted: references.map(() => 1),
    director_reference_strength_values: references.map((r) => r.strength),
    // NovelAI sends 1 − Fidelity.
    director_reference_secondary_strength_values: references.map((r) => 1 - r.fidelity),
  };
}

/** Anlas the references add: 5 per reference, per image made. */
export const referenceCost = (count: number, nSamples = 1) => REFERENCE_PRICE * count * Math.max(1, nSamples);

// ─── Fitting the image ───────────────────────────────────────────────────────

// V5's sizes for a reference, all multiples of 64 between about 0.85 and
// 1 MP (NovelAI's table, in its order; ties go to the earlier one).
// prettier-ignore
const V5_BUCKETS: readonly [number, number][] = [
  [256,4096],[256,4032],[256,3968],[256,3904],[256,3840],[256,3776],[256,3712],[256,3648],[256,3584],
  [256,3520],[256,3456],[256,3392],[256,3328],[320,3264],[320,3200],[320,3136],[320,3072],[320,3008],
  [320,2944],[320,2880],[320,2816],[320,2752],[384,2688],[384,2624],[384,2560],[384,2496],[384,2432],
  [384,2368],[448,2304],[448,2240],[448,2176],[448,2112],[512,2048],[512,1984],[512,1920],[512,1856],
  [576,1792],[576,1728],[576,1664],[640,1600],[640,1536],[704,1472],[704,1408],[768,1344],[768,1280],
  [832,1216],[896,1152],[960,1088],[1024,1024],[1088,960],[1152,896],[1216,832],[1280,768],[1344,768],
  [1408,704],[1472,704],[1536,640],[1600,640],[1664,576],[1728,576],[1792,576],[1856,512],[1920,512],
  [1984,512],[2048,512],[2112,448],[2176,448],[2240,448],[2304,448],[2368,384],[2432,384],[2496,384],
  [2560,384],[2624,384],[2688,384],[2752,320],[2816,320],[2880,320],[2944,320],[3008,320],[3072,320],
  [3136,320],[3200,320],[3264,320],[3328,256],[3392,256],[3456,256],[3520,256],[3584,256],[3648,256],
  [3712,256],[3776,256],[3840,256],[3904,256],[3968,256],[4032,256],[4096,256],
];

/** V4.5's canvases: portrait, landscape, square. */
const V45_CANVASES: readonly [number, number][] = [
  [1024, 1536],
  [1536, 1024],
  [1472, 1472],
];

export interface BucketFit {
  width: number;
  height: number;
  /** Scaled to cover the bucket, then cropped to it from the centre. */
  resizeWidth: number;
  resizeHeight: number;
  left: number;
  top: number;
  /** Already that size: NovelAI then sends the image as it is. */
  unchanged: boolean;
}

/** V5: the bucket nearest in aspect ratio (compared as logs), covered and
 *  centre-cropped. */
export function bucketFit(width: number, height: number): BucketFit {
  const aspect = Math.log(Math.max(width, 1) / Math.max(height, 1));
  let best = V5_BUCKETS[0];
  let bestDiff = Math.abs(aspect - Math.log(best[0] / best[1]));
  for (const b of V5_BUCKETS) {
    const diff = Math.abs(aspect - Math.log(b[0] / b[1]));
    if (diff < bestDiff) {
      best = b;
      bestDiff = diff;
    }
  }
  const [bw, bh] = best;
  const scale = Math.max(bw / width, bh / height);
  const resizeWidth = Math.max(Math.floor(width * scale + 0.5), bw);
  const resizeHeight = Math.max(Math.floor(height * scale + 0.5), bh);
  return {
    width: bw,
    height: bh,
    resizeWidth,
    resizeHeight,
    left: Math.floor((resizeWidth - bw) / 2),
    top: Math.floor((resizeHeight - bh) / 2),
    unchanged: width === bw && height === bh,
  };
}

export interface LetterboxFit {
  canvasWidth: number;
  canvasHeight: number;
  /** The image's size inside the canvas, and where it goes. */
  width: number;
  height: number;
  left: number;
  top: number;
}

/** V4.5: the canvas nearest in aspect ratio, with the whole image fitted
 *  inside it and centred; the rest is filled black. */
export function letterboxFit(width: number, height: number): LetterboxFit {
  const aspect = width / height;
  let best = V45_CANVASES[0];
  for (const c of V45_CANVASES) {
    if (Math.abs(c[0] / c[1] - aspect) < Math.abs(best[0] / best[1] - aspect)) best = c;
  }
  const [cw, ch] = best;
  let w = width;
  let h = height;
  if (aspect > cw / ch) {
    w = cw;
    h = Math.round(cw / aspect);
  } else {
    h = ch;
    w = Math.round(ch * aspect);
  }
  return { canvasWidth: cw, canvasHeight: ch, width: w, height: h, left: Math.round((cw - w) / 2), top: Math.round((ch - h) / 2) };
}
