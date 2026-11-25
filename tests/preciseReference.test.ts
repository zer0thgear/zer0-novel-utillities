import { describe, expect, it } from 'vitest';
import {
  bucketFit,
  effortWithReferences,
  KIND_DESCRIPTION,
  letterboxFit,
  PreciseReference,
  prefersSameOutfit,
  referenceCaps,
  referenceCost,
  referenceParameters,
  referencesFor,
  withSameOutfit,
} from '@/lib/preciseReference';
import { buildImageRequest } from '@/lib/imageRequest';
import { calculateAnlasCost } from '@/lib/anlasCost';
import { decodeImage, encodePng, fromBase64, Pixels, prepareReferenceImage, toBase64 } from '@/lib/requestImage';
import { NovelAIModel } from '@/types/novelai';

// Precise Reference as novelai.net's client does it (read 2026-11-24). The
// bucket sizes below came from running NovelAI's own bucket function, from
// its client, on the same inputs.

const ref = (over: Partial<PreciseReference> = {}): PreciseReference => ({
  id: 'r',
  data: 'AAAA',
  url: 'blob:r',
  name: 'r.png',
  width: 832,
  height: 1216,
  description: 'character&style',
  strength: 1,
  fidelity: 1,
  enabled: true,
  ...over,
});

describe('which models take references', () => {
  it('V5 (Full, Curated, Medium): outfits, no Fidelity, strength to 5, not while inpainting', () => {
    for (const m of ['nai-diffusion-5-full', 'nai-diffusion-5-curated', 'nai-diffusion-5-full-medium'] as NovelAIModel[]) {
      expect(referenceCaps(m)).toEqual({ outfits: true, fidelity: false, inpainting: false, strengthMax: 5, fit: 'bucket' });
    }
  });

  it('V4.5: Fidelity, strength to 1, also while inpainting, no outfits', () => {
    for (const m of ['nai-diffusion-4-5-full', 'nai-diffusion-4-5-curated-inpainting'] as NovelAIModel[]) {
      expect(referenceCaps(m)).toEqual({ outfits: false, fidelity: true, inpainting: true, strengthMax: 1, fit: 'letterbox' });
    }
  });

  it('none before V4.5', () => {
    for (const m of ['nai-diffusion-4-full', 'nai-diffusion-4-curated-preview', 'nai-diffusion-3'] as NovelAIModel[]) {
      expect(referenceCaps(m)).toBeNull();
    }
  });
});

describe('the outfit switch', () => {
  it('picking a type sets NovelAI’s default variant', () => {
    expect(KIND_DESCRIPTION.characterAndStyle).toBe('character&style');
    expect(KIND_DESCRIPTION.character).toBe('character');
    expect(KIND_DESCRIPTION.outfit).toBe('costume');
  });

  it('Character & Style starts with Prefer same outfit on, Character with it off', () => {
    expect(prefersSameOutfit('character&style')).toBe(true);
    expect(prefersSameOutfit('character')).toBe(false);
    expect(prefersSameOutfit('style')).toBeNull();
  });

  it('switches between the variants', () => {
    expect(withSameOutfit('character&style', false)).toBe('character&style_anyoutfit');
    expect(withSameOutfit('character&style_anyoutfit', true)).toBe('character&style');
    expect(withSameOutfit('character', true)).toBe('character_mainoutfit');
    expect(withSameOutfit('style', true)).toBe('style');
  });
});

describe('referencesFor', () => {
  it('sends enabled references only', () => {
    expect(referencesFor([ref(), ref({ id: 'off', enabled: false })], 'nai-diffusion-5-full').map((r) => r.id)).toEqual(['r']);
  });

  it('V5 sends Fidelity as 1, and keeps the outfit variants', () => {
    const out = referencesFor([ref({ fidelity: 0.3, description: 'character_mainoutfit' })], 'nai-diffusion-5-full');
    expect(out[0].fidelity).toBe(1);
    expect(out[0].description).toBe('character_mainoutfit');
  });

  it('V4.5 drops Outfit references and maps the variants back', () => {
    const out = referencesFor(
      [
        ref({ id: 'o', description: 'costume' }),
        ref({ id: 'c', description: 'character_mainoutfit', fidelity: 0.4 }),
        ref({ id: 'cs', description: 'character&style_anyoutfit' }),
      ],
      'nai-diffusion-4-5-full',
    );
    expect(out.map((r) => [r.id, r.description, r.fidelity])).toEqual([
      ['c', 'character', 0.4],
      ['cs', 'character&style', 1],
    ]);
  });

  it('none while inpainting on V5, but V4.5 keeps them', () => {
    expect(referencesFor([ref()], 'nai-diffusion-5-full-inpainting', { inpainting: true })).toEqual([]);
    expect(referencesFor([ref()], 'nai-diffusion-4-5-full-inpainting', { inpainting: true })).toHaveLength(1);
  });

  it('none on a model without references', () => {
    expect(referencesFor([ref()], 'nai-diffusion-4-full')).toEqual([]);
  });
});

describe('the request fields', () => {
  it('are parallel arrays, with 1 − Fidelity as the secondary strength', () => {
    const p = referenceParameters([ref({ strength: 2.5, fidelity: 0.75, description: 'style', data: 'IMG' })]);
    expect(p).toEqual({
      director_reference_images: ['IMG'],
      director_reference_descriptions: [{ caption: { base_caption: 'style', char_captions: [] }, legacy_uc: false }],
      director_reference_information_extracted: [1],
      director_reference_strength_values: [2.5],
      director_reference_secondary_strength_values: [0.25],
    });
  });

  const build = (model: NovelAIModel, action: 'generate' | 'infill', references: PreciseReference[]) =>
    buildImageRequest({
      input: '1girl',
      negativePrompt: '',
      model,
      action,
      characters: [],
      useCoords: false,
      references,
      parameters: { width: 832, height: 1216, scale: 5, sampler: 'k_euler_ancestral', steps: 23, n_samples: 1, seed: 1, add_original_image: true, noise_schedule: 'karras' },
    }).parameters;

  it('go on a V5 generation', () => {
    const p = build('nai-diffusion-5-full', 'generate', [ref()]);
    expect(p.director_reference_descriptions?.[0].caption.base_caption).toBe('character&style');
    expect(p.director_reference_secondary_strength_values).toEqual([0]);
  });

  it('are left out entirely without references, or on a V5 inpaint', () => {
    expect(build('nai-diffusion-5-full', 'generate', [])).not.toHaveProperty('director_reference_images');
    expect(build('nai-diffusion-5-full-inpainting', 'infill', [ref()])).not.toHaveProperty('director_reference_images');
  });

  it('go on a V4.5 inpaint', () => {
    expect(build('nai-diffusion-4-5-full-inpainting', 'infill', [ref()]).director_reference_images).toEqual(['AAAA']);
  });

  it('every V5 request runs Karras, as NovelAI’s request class forces', () => {
    const p = buildImageRequest({
      input: '',
      negativePrompt: '',
      model: 'nai-diffusion-5-curated',
      action: 'generate',
      characters: [],
      useCoords: false,
      parameters: { width: 832, height: 1216, scale: 5, sampler: 'k_euler_ancestral', steps: 23, n_samples: 1, seed: 1, add_original_image: true, noise_schedule: 'exponential' },
    }).parameters;
    expect(p.noise_schedule).toBe('karras');
  });
});

describe('Medium effort and references', () => {
  it('any reference makes Medium run High, even a disabled one', () => {
    expect(effortWithReferences('medium', 1)).toBe('high');
    expect(effortWithReferences('medium', 0)).toBe('medium');
    expect(effortWithReferences('high', 3)).toBe('high');
  });

  it('except on an inpaint, where V5 sends none', () => {
    expect(effortWithReferences('medium', 2, { inpainting: true })).toBe('medium');
  });
});

describe('price', () => {
  it('is 5 Anlas per reference per image', () => {
    expect(referenceCost(2, 1)).toBe(10);
    expect(referenceCost(3, 4)).toBe(60);
  });

  it('adds to the image’s own price, which keeps its Opus discount', () => {
    const base = { model: 'nai-diffusion-5-full' as NovelAIModel, width: 832, height: 1216, steps: 23, smea: false, smeaDyn: false };
    expect(calculateAnlasCost({ ...base, isOpus: true, references: 2 })).toBe(10);
    expect(calculateAnlasCost({ ...base, isOpus: false, references: 2 })).toBe(26 + 10);
    expect(calculateAnlasCost({ ...base, isOpus: true, references: 1, nSamples: 4 })).toBe(26 * 3 + 20);
  });
});

describe('fitting the image', () => {
  it.each([
    [832, 1216, 832, 1216, 832, 1216, 0, 0, true],
    [1000, 1000, 1024, 1024, 1024, 1024, 0, 0, false],
    [1920, 1080, 1344, 768, 1365, 768, 10, 0, false],
    [1080, 1920, 768, 1344, 768, 1365, 0, 10, false],
    [3000, 2000, 1216, 832, 1248, 832, 16, 0, false],
    [100, 900, 320, 2880, 320, 2880, 0, 0, false],
  ])('V5: %ix%i goes to %ix%i (scaled to %ix%i, cropped from %i,%i)', (w, h, bw, bh, rw, rh, left, top, unchanged) => {
    expect(bucketFit(w, h)).toEqual({ width: bw, height: bh, resizeWidth: rw, resizeHeight: rh, left, top, unchanged });
  });

  it.each([
    [832, 1216, 1024, 1536, 1024, 1497, 0, 20],
    [1920, 1080, 1536, 1024, 1536, 864, 0, 80],
    [1000, 1000, 1472, 1472, 1472, 1472, 0, 0],
    [1100, 1000, 1472, 1472, 1472, 1338, 0, 67],
  ])('V4.5: %ix%i fits in %ix%i as %ix%i at %i,%i', (w, h, cw, ch, fw, fh, left, top) => {
    expect(letterboxFit(w, h)).toEqual({ canvasWidth: cw, canvasHeight: ch, width: fw, height: fh, left, top });
  });
});

describe('prepareReferenceImage', () => {
  const solid = (width: number, height: number, rgba: [number, number, number, number]): Pixels => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
    return { width, height, data };
  };
  const b64 = async (p: Pixels) => toBase64(await encodePng(p));

  it('V5 sends an image already at a bucket size as it is', async () => {
    const original = await b64(solid(832, 1216, [10, 20, 30, 255]));
    expect(await prepareReferenceImage(original, 'nai-diffusion-5-full')).toBe(original);
  });

  it('V5 resizes and crops to the bucket', async () => {
    const out = await decodeImage(fromBase64(await prepareReferenceImage(await b64(solid(1000, 1000, [200, 0, 0, 255])), 'nai-diffusion-5-full')));
    expect([out.width, out.height]).toEqual([1024, 1024]);
  });

  it('V4.5 pads the image onto its canvas in black', async () => {
    const out = await decodeImage(
      fromBase64(await prepareReferenceImage(await b64(solid(100, 50, [255, 0, 0, 255])), 'nai-diffusion-4-5-full')),
    );
    // 2:1 goes on the 1536×1024 canvas, 1536×768 of it the image.
    expect([out.width, out.height]).toEqual([1536, 1024]);
    const at = (x: number, y: number) => Array.from(out.data.slice((y * out.width + x) * 4, (y * out.width + x) * 4 + 4));
    expect(at(10, 10)).toEqual([0, 0, 0, 255]);
    expect(at(768, 512)).toEqual([255, 0, 0, 255]);
  });

  it('leaves a model without references alone', async () => {
    expect(await prepareReferenceImage('AAAA', 'nai-diffusion-3')).toBe('AAAA');
  });
});
