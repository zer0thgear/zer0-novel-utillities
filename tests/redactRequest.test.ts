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

  it('keeps prompts, which are never that long', () => {
    const prompt = '1girl, '.repeat(30); // 210 characters
    expect(redactRequest({ input: prompt })).toEqual({ input: prompt });
  });

  it('passes other values through untouched', () => {
    expect(redactRequest(null)).toBeNull();
    expect(redactRequest(42)).toBe(42);
    expect(redactRequest(false)).toBe(false);
    expect(redactRequest(undefined)).toBeUndefined();
  });
});
