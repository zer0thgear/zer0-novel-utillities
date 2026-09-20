import { describe, expect, it } from 'vitest';
import { chainSummary, parseChain, planChain, producesImage, stepLabel } from '@/lib/chains';
import { Chain, ChainStep } from '@/types/novelai';

const chain = (...steps: ChainStep[]): Chain => ({ id: 'c1', name: 'Test', steps });

// An 832x1216 V5 image, the app's default portrait size.
const image = { width: 832, height: 1216, model: 'nai-diffusion-5-full' as const, steps: 23 };
const ctx = {
  formModel: 'nai-diffusion-5-full' as const,
  formSteps: 23,
  isOpus: true,
  opusExhausted: false,
};

const plan = (...steps: ChainStep[]) => planChain(chain(...steps), image, ctx);

describe('planChain sizes', () => {
  it('walks the size through each step', () => {
    const out = plan({ kind: 'enhance', level: 3, scale: 1.5 }, { kind: 'download' });
    // 1.5x of 832x1216 is 1248x1824, sent (and so priced and returned) at 1280x1856.
    expect(out.steps[0]).toMatchObject({ width: 1280, height: 1856 });
    // Download passes its input along unchanged.
    expect(out.steps[1]).toMatchObject({ width: 1280, height: 1856 });
  });

  it('doubles the size on Upscale', () => {
    const out = planChain(chain({ kind: 'upscale' }), { ...image, width: 512, height: 512 }, ctx);
    expect(out.steps[0]).toMatchObject({ width: 1024, height: 1024 });
    expect(out.problems).toEqual([]);
  });

  it('shrinks to the pixel grid when Pixel Snap does not upscale', () => {
    const out = plan({ kind: 'pixelSnap', palettize: 'auto', avoidOverRefining: false, upscale: false });
    expect(Math.max(out.steps[0].width, out.steps[0].height)).toBe(64);
    const smaller = plan({ kind: 'pixelSnap', palettize: 'auto', avoidOverRefining: true, upscale: false });
    expect(Math.max(smaller.steps[0].width, smaller.steps[0].height)).toBe(48);
  });
});

describe('planChain problems', () => {
  it('rejects an empty chain', () => {
    expect(planChain(chain(), image, ctx).problems).toEqual(['This chain has no steps.']);
  });

  it('rejects Upscale above 1 megapixel, naming the size it would get', () => {
    // 832x1216 is just under 1 MP, so it takes a bigger image to trip this.
    const out = planChain(chain({ kind: 'upscale' }), { ...image, width: 1216, height: 1216 }, ctx);
    expect(out.problems[0]).toContain('1 megapixel');
    expect(out.problems[0]).toContain('1216×1216');
  });

  it('rejects a scale NovelAI would not offer for the image', () => {
    const out = plan({ kind: 'enhance', level: 3, scale: 2 });
    expect(out.problems[0]).toContain("doesn't offer 2×");
  });

  it('only allows Variations last', () => {
    expect(plan({ kind: 'variations' }).problems).toEqual([]);
    expect(plan({ kind: 'variations' }, { kind: 'download' }).problems[0]).toContain('last step');
  });

  it('catches a render past 3.1 megapixels', () => {
    const out = planChain(chain({ kind: 'variations' }), { ...image, width: 1664, height: 2048 }, ctx);
    expect(out.problems[0]).toContain('3.1 megapixels');
  });

  it('wants an emotion picked for the Emotion tool', () => {
    expect(plan({ kind: 'director', tool: 'emotion' }).problems[0]).toContain('Pick an emotion');
    expect(plan({ kind: 'director', tool: 'emotion', emotion: 'Happy' }).problems).toEqual([]);
  });

  describe('Add Tags', () => {
    it('needs tags, and a later step that uses the prompt', () => {
      expect(plan({ kind: 'tags', tags: '  ' }, { kind: 'variations' }).problems[0]).toContain('Enter the tags');
      expect(plan({ kind: 'tags', tags: 'smile' }, { kind: 'upscale' }).problems[0]).toContain('none comes after');
      expect(plan({ kind: 'tags', tags: 'smile' }, { kind: 'variations' }).problems).toEqual([]);
    });

    it('costs nothing itself', () => {
      expect(plan({ kind: 'tags', tags: 'smile' }, { kind: 'variations' }).steps[0].cost).toBe(0);
    });
  });

  describe('Sweep', () => {
    const axis = { key: 'cfg', text: '4, 5', picked: [] };
    const none = { key: 'none', text: '', picked: [] };

    it('must be last, and needs a usable X axis', () => {
      expect(plan({ kind: 'sweep', x: axis, y: none }).problems).toEqual([]);
      expect(plan({ kind: 'sweep', x: axis, y: none }, { kind: 'download' }).problems[0]).toContain('last step');
      expect(plan({ kind: 'sweep', x: none, y: none }).problems[0]).toContain('X axis');
    });

    it('refuses wildcard axes, since the prompt is already rolled', () => {
      const out = plan({ kind: 'sweep', x: { key: 'wildcard:hair', text: '', picked: ['red'] }, y: none });
      expect(out.problems[0]).toContain("Wildcard axes aren't available");
    });

    it('refuses more cells than the limit', () => {
      const many = { key: 'seed', text: Array.from({ length: 9 }, (_, i) => i + 1).join(', '), picked: [] };
      const out = plan({ kind: 'sweep', x: many, y: many });
      expect(out.problems[0]).toContain('81 images');
    });

    it('prices every cell', () => {
      const one = plan({ kind: 'sweep', x: { key: 'cfg', text: '5', picked: [] }, y: none }).steps[0].cost;
      const four = plan({ kind: 'sweep', x: { key: 'cfg', text: '4, 5, 6, 7', picked: [] }, y: none }).steps[0].cost;
      expect(four).toBe(one * 4);
    });
  });
});

describe('planChain costs', () => {
  it('adds up to the cost per source image', () => {
    const out = plan({ kind: 'enhance', level: 3, scale: 1 }, { kind: 'director', tool: 'lineart' });
    expect(out.costPerImage).toBe(out.steps[0].cost + out.steps[1].cost);
  });

  it('charges more for a stronger Enhance level', () => {
    // Off Opus: at this size the free allowance would make both of them 0.
    const paid = { ...ctx, isOpus: false };
    const light = planChain(chain({ kind: 'enhance', level: 1, scale: 1 }), image, paid).costPerImage;
    const heavy = planChain(chain({ kind: 'enhance', level: 5, scale: 1 }), image, paid).costPerImage;
    expect(heavy).toBeGreaterThan(light);
  });

  it('charges nothing for Download or Pixel Snap', () => {
    const out = plan({ kind: 'download' }, { kind: 'pixelSnap', palettize: 'off', avoidOverRefining: false, upscale: true });
    expect(out.costPerImage).toBe(0);
  });
});

describe('labels', () => {
  it('describes each step', () => {
    expect(stepLabel({ kind: 'enhance', level: 3, scale: 1.5 })).toContain('1.5×');
    expect(stepLabel({ kind: 'variations' })).toBe('Variations ×3');
    expect(chainSummary(chain({ kind: 'upscale' }, { kind: 'download' }))).toContain(' → ');
    expect(chainSummary(chain())).toBe('No steps');
  });

  it('knows which steps make a new image', () => {
    expect(producesImage({ kind: 'upscale' })).toBe(true);
    expect(producesImage({ kind: 'download' })).toBe(false);
    expect(producesImage({ kind: 'tags', tags: 'smile' })).toBe(false);
  });
});

describe('parseChain (untrusted import)', () => {
  it('rejects anything that is not a chain', () => {
    for (const bad of [null, 42, 'chain', {}, { id: 'a', name: 'b' }, { id: 'a', name: 'b', steps: 'x' }]) {
      expect(parseChain(bad)).toBeNull();
    }
  });

  it('drops steps it does not recognise', () => {
    const parsed = parseChain({ id: 'a', name: 'b', steps: [{ kind: 'upscale' }, { kind: 'nonsense' }, null] });
    expect(parsed?.steps).toEqual([{ kind: 'upscale' }]);
  });

  it('validates an enhance step’s level and scale', () => {
    expect(parseChain({ id: 'a', name: 'b', steps: [{ kind: 'enhance', level: 9 }] })?.steps).toEqual([]);
    expect(parseChain({ id: 'a', name: 'b', steps: [{ kind: 'enhance', level: 3, scale: 'max' }] })?.steps).toEqual([
      { kind: 'enhance', level: 3, scale: 'max' },
    ]);
  });

  it('reads the old upscale flag as 1.5x', () => {
    expect(parseChain({ id: 'a', name: 'b', steps: [{ kind: 'enhance', level: 2, upscale: true }] })?.steps).toEqual([
      { kind: 'enhance', level: 2, scale: 1.5 },
    ]);
  });

  it('drops out-of-range extras rather than trusting them', () => {
    const parsed = parseChain({
      id: 'a',
      name: 'b',
      steps: [{ kind: 'director', tool: 'colorize', defry: 99, emotion: 'Smug' }],
    });
    expect(parsed?.steps[0]).toEqual({ kind: 'director', tool: 'colorize' });
  });

  it('keeps a sweep step’s axes, defaulting a missing Y to none', () => {
    const parsed = parseChain({
      id: 'a',
      name: 'b',
      steps: [{ kind: 'sweep', x: { key: 'cfg', text: '4, 5', picked: ['x'], baseline: true } }],
    });
    expect(parsed?.steps[0]).toEqual({
      kind: 'sweep',
      x: { key: 'cfg', text: '4, 5', picked: ['x'], baseline: true },
      y: { key: 'none', text: '', picked: [] },
    });
  });
});
