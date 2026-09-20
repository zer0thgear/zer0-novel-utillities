import { describe, expect, it } from 'vitest';
import { redactRequest } from '@/lib/redactRequest';

const base64 = (kb: number) => 'A'.repeat(Math.round((kb * 1024 * 4) / 3));

describe('redactRequest', () => {
  it('leaves an ordinary request alone', () => {
    const request = {
      input: '1girl, smile',
      model: 'nai-diffusion-5-full',
      parameters: { width: 832, height: 1216, seed: 42, sm: false, skip_cfg_above_sigma: null },
    };
    expect(redactRequest(request)).toEqual(request);
  });

  it('replaces a long base64 field with its size', () => {
    const out = redactRequest({ parameters: { image: base64(500) } }) as {
      parameters: { image: string };
    };
    expect(out.parameters.image).toBe('<500 KB of image data>');
  });

  it('reaches into arrays and nested objects', () => {
    const out = redactRequest({
      parameters: {
        v4_prompt: { caption: { char_captions: [{ char_caption: base64(8) }] } },
        masks: [base64(4)],
      },
    }) as { parameters: { v4_prompt: { caption: { char_captions: { char_caption: string }[] } }; masks: string[] } };
    expect(out.parameters.v4_prompt.caption.char_captions[0].char_caption).toContain('KB of image data');
    expect(out.parameters.masks[0]).toContain('KB of image data');
  });

  it('keeps a prompt however long it is', () => {
    // A UC preset alone runs past the length cutoff, so length can't be the
    // only test; a prompt's punctuation is what tells it apart from base64.
    const uc = 'lowres, {bad}, error, fewer, extra, missing, worst quality, '.repeat(8);
    expect(uc.length).toBeGreaterThan(256);
    expect(redactRequest({ negative_prompt: uc })).toEqual({ negative_prompt: uc });
  });

  it('shortens a long base64 value even under a key it does not know', () => {
    const out = redactRequest({ something_new: base64(300) }) as { something_new: string };
    expect(out.something_new).toContain('KB of image data');
  });

  it('leaves a short value under an image key alone', () => {
    // NovelAI's multipart requests put the literal string "image" there.
    expect(redactRequest({ image: 'image' })).toEqual({ image: 'image' });
  });

  it('passes other values through untouched', () => {
    expect(redactRequest(null)).toBeNull();
    expect(redactRequest(42)).toBe(42);
    expect(redactRequest(false)).toBe(false);
    expect(redactRequest(undefined)).toBeUndefined();
  });
});
