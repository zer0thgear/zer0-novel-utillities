import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasInpaintStrength, inpaintImg2Img, toInpaintingModel } from '@/lib/inpaint';
import { encodePng, finalizeRequest, toBase64 } from '@/lib/requestImage';
import { hasVariety } from '@/lib/variety';
import { applyEditorResult, baseFromImage } from '@/lib/editorResult';
import type { Img2ImgSource } from '@/store/sessionStore';
import { GeneratedImage, NovelAIGenerateRequest, NovelAIModel } from '@/types/novelai';

describe('toInpaintingModel', () => {
  it('follows NovelAI’s mapping, which is not always a suffix', () => {
    expect(toInpaintingModel('nai-diffusion-5-full')).toBe('nai-diffusion-5-full-inpainting');
    // V5 Curated has none of its own; NovelAI uses V4.5 Curated's.
    expect(toInpaintingModel('nai-diffusion-5-curated')).toBe('nai-diffusion-4-5-curated-inpainting');
    // V4 Curated drops "-preview".
    expect(toInpaintingModel('nai-diffusion-4-curated-preview')).toBe('nai-diffusion-4-curated-inpainting');
    expect(toInpaintingModel('nai-diffusion-3')).toBe('nai-diffusion-3-inpainting');
  });

  it('leaves an inpainting model as it is', () => {
    expect(toInpaintingModel('nai-diffusion-4-5-full-inpainting')).toBe('nai-diffusion-4-5-full-inpainting');
  });
});

describe('inpainting strength', () => {
  it('exists from V4 on, as NovelAI’s img2imgInpainting flag has it', () => {
    for (const m of ['nai-diffusion-5-full', 'nai-diffusion-5-curated', 'nai-diffusion-4-5-full', 'nai-diffusion-4-full'] as NovelAIModel[]) {
      expect(hasInpaintStrength(m)).toBe(true);
    }
    expect(hasInpaintStrength('nai-diffusion-3')).toBe(false);
    expect(hasInpaintStrength('nai-diffusion-furry-3')).toBe(false);
  });

  it('adds an img2img block only below 1, with colour correction', () => {
    expect(inpaintImg2Img('nai-diffusion-4-5-full-inpainting', 1)).toBeUndefined();
    expect(inpaintImg2Img('nai-diffusion-4-5-full-inpainting', 0.5)).toEqual({ strength: 0.5, color_correct: true });
  });

  it('never adds one on V3, which has no strength', () => {
    expect(inpaintImg2Img('nai-diffusion-3-inpainting', 0.5)).toBeUndefined();
  });
});

describe('Variety+ on inpainting models', () => {
  it('follows each inpainting model’s own table entry', () => {
    expect(hasVariety('nai-diffusion-4-5-full-inpainting')).toBe(true);
    // What V5 Curated inpaints with has it, though V5 Curated itself doesn't.
    expect(hasVariety('nai-diffusion-4-5-curated-inpainting')).toBe(true);
    expect(hasVariety('nai-diffusion-3-inpainting')).toBe(true);
    expect(hasVariety('nai-diffusion-5-full-inpainting')).toBe(false);
  });
});

describe('finalizeRequest’s Image2Image and inpaint rules', () => {
  const request = (action: NovelAIGenerateRequest['action'], model: NovelAIModel, extra: object = {}) =>
    ({
      input: '1girl',
      model,
      action,
      parameters: { width: 832, height: 1216, seed: 5, ...extra },
    }) as NovelAIGenerateRequest;

  it('turns colour correction off on Image2Image', async () => {
    const out = await finalizeRequest(request('img2img', 'nai-diffusion-5-full', { color_correct: true }));
    expect(out.parameters.color_correct).toBe(false);
  });

  it('leaves it alone on a plain generation', async () => {
    const out = await finalizeRequest(request('generate', 'nai-diffusion-5-full'));
    expect(out.parameters).not.toHaveProperty('color_correct');
  });

  const png = async () =>
    toBase64(await encodePng({ width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4).fill(255) }));

  it('drops SMEA from an image request on V4 and later, which have none', async () => {
    const out = await finalizeRequest(
      request('infill', 'nai-diffusion-4-5-full-inpainting', { image: await png(), sm: false, sm_dyn: false }),
    );
    expect(out.parameters).not.toHaveProperty('sm');
    expect(out.parameters).not.toHaveProperty('sm_dyn');
  });

  it('turns SMEA off on a V3 image request', async () => {
    const out = await finalizeRequest(request('img2img', 'nai-diffusion-3', { image: await png(), sm: true, sm_dyn: true }));
    expect(out.parameters.sm).toBe(false);
    expect(out.parameters.sm_dyn).toBe(false);
  });

  it('drops a stray img2img block when there is no mask', async () => {
    const out = await finalizeRequest(
      request('generate', 'nai-diffusion-5-full', { img2img: { strength: 0.5, color_correct: true } }),
    );
    expect(out.parameters).not.toHaveProperty('img2img');
  });
});

describe('applyEditorResult', () => {
  const blob = (label: string) => new Blob([label], { type: 'image/png' });
  let urls = 0;
  beforeEach(() => {
    urls = 0;
    globalThis.URL.createObjectURL = vi.fn(() => `blob:${++urls}`);
  });

  const base = (): Img2ImgSource => ({ blob: blob('picture'), url: 'blob:0', width: 832, height: 1216 });

  it('paint: sends the composite, and keeps the picture and paint apart for next time', () => {
    const src = base();
    const out = applyEditorResult(src, 'paint', { layer: blob('paint'), composite: blob('composite'), empty: false });
    expect(out.blob).not.toBe(src.blob);
    expect(out.original).toBe(src.blob);
    expect(out.paint).toBeDefined();
    expect(out.url).toBe('blob:1');
  });

  it('paint again: keeps the first original, not the painted one', () => {
    const first = applyEditorResult(base(), 'paint', { layer: blob('p1'), composite: blob('c1'), empty: false });
    const second = applyEditorResult(first, 'paint', { layer: blob('p2'), composite: blob('c2'), empty: false });
    expect(second.original).toBe(first.original);
  });

  it('paint cleared: back to the untouched picture', () => {
    const painted = applyEditorResult(base(), 'paint', { layer: blob('p'), composite: blob('c'), empty: false });
    const cleared = applyEditorResult(painted, 'paint', { layer: blob('p'), composite: blob('c'), empty: true });
    expect(cleared.blob).toBe(painted.original);
    expect(cleared.original).toBeUndefined();
    expect(cleared.paint).toBeUndefined();
  });

  it('mask: adds it without touching the picture', () => {
    const src = base();
    const out = applyEditorResult(src, 'mask', { layer: blob('small'), mask: blob('full'), empty: false });
    expect(out.blob).toBe(src.blob);
    expect(out.url).toBe(src.url);
    expect(out.mask?.full).toBeDefined();
    expect(out.mask?.layer).toBeDefined();
  });

  it('mask cleared: removes it rather than sending an empty one', () => {
    const masked = applyEditorResult(base(), 'mask', { layer: blob('s'), mask: blob('f'), empty: false });
    expect(applyEditorResult(masked, 'mask', { layer: blob('s'), mask: blob('f'), empty: true }).mask).toBeUndefined();
  });

  it('keeps a mask through a paint edit, and paint through a mask edit', () => {
    const masked = applyEditorResult(base(), 'mask', { layer: blob('s'), mask: blob('f'), empty: false });
    const painted = applyEditorResult(masked, 'paint', { layer: blob('p'), composite: blob('c'), empty: false });
    expect(painted.mask).toBe(masked.mask);
    const remasked = applyEditorResult(painted, 'mask', { layer: blob('s2'), mask: blob('f2'), empty: false });
    expect(remasked.paint).toBe(painted.paint);
  });
});

describe('baseFromImage', () => {
  it('remembers the history image and its rolls', () => {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    const image = {
      id: 'img-1',
      parameters: { width: 1024, height: 1024 },
      wildcardPicks: { 'base|hair': ['red'] },
    } as unknown as GeneratedImage;
    const picture = new Blob(['p']);
    expect(baseFromImage(image, picture)).toEqual({
      blob: picture,
      url: 'blob:x',
      width: 1024,
      height: 1024,
      from: { imageId: 'img-1', picks: { 'base|hair': ['red'] } },
    });
  });
});
