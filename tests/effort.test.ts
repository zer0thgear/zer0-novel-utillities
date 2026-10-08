import { describe, expect, it } from 'vitest';
import { hasEffort, isMediumEffort, MEDIUM_EFFORT, modelShortName, splitEffort, withEffort } from '@/lib/models';
import { buildImageRequest } from '@/lib/imageRequest';
import { calculateAnlasCost } from '@/lib/anlasCost';
import { toInpaintingModel } from '@/lib/inpaint';
import { composeNegativeWithUc, getUcText } from '@/lib/naiPresets';
import { axisInfo, draftFor, sweepCells, toAxis } from '@/lib/sweeps';
import { readNaiMetadata } from '@/lib/naiMetadata';
import { encodePng, withChunksAfterHeader } from '@/lib/requestImage';
import { CharacterPromptEntry, NovelAIModel } from '@/types/novelai';

// V5 Full's Effort toggle, as novelai.net's client has it (read 2026-10-08):
// Medium is its own model, which fixes steps, sampler and the UC preset, has
// no CFG Rescale, and is priced with a factor on the per-step part.

describe('effort models', () => {
  it('only V5 Full has the toggle', () => {
    expect(hasEffort('nai-diffusion-5-full')).toBe(true);
    expect(hasEffort('nai-diffusion-5-full-medium')).toBe(true);
    expect(hasEffort('nai-diffusion-5-curated')).toBe(false);
    expect(hasEffort('nai-diffusion-4-5-full')).toBe(false);
  });

  it('switches V5 Full (and its inpainting model) to Medium and back', () => {
    expect(withEffort('nai-diffusion-5-full', 'medium')).toBe('nai-diffusion-5-full-medium');
    expect(withEffort('nai-diffusion-5-full', 'high')).toBe('nai-diffusion-5-full');
    expect(withEffort('nai-diffusion-5-full-medium', 'high')).toBe('nai-diffusion-5-full');
    expect(withEffort('nai-diffusion-5-full-inpainting', 'medium')).toBe('nai-diffusion-5-full-medium-inpainting');
  });

  it('leaves other models alone', () => {
    expect(withEffort('nai-diffusion-5-curated', 'medium')).toBe('nai-diffusion-5-curated');
    expect(withEffort('nai-diffusion-3', 'medium')).toBe('nai-diffusion-3');
  });

  it('inpaints Medium with its own inpainting model', () => {
    expect(toInpaintingModel('nai-diffusion-5-full-medium')).toBe('nai-diffusion-5-full-medium-inpainting');
    expect(isMediumEffort('nai-diffusion-5-full-medium-inpainting')).toBe(true);
  });

  it('reads an image’s model back as V5 Full plus the effort', () => {
    expect(splitEffort('nai-diffusion-5-full-medium')).toEqual({ model: 'nai-diffusion-5-full', effort: 'medium' });
    expect(splitEffort('nai-diffusion-5-full')).toEqual({ model: 'nai-diffusion-5-full', effort: 'high' });
    expect(splitEffort('nai-diffusion-4-5-full')).toEqual({ model: 'nai-diffusion-4-5-full' });
  });

  it('names Medium after V5 Full', () => {
    expect(modelShortName('nai-diffusion-5-full-medium')).toBe('V5 Full (Medium)');
  });
});

describe('a Medium effort request', () => {
  const character = (prompt: string, uc: string): CharacterPromptEntry => ({
    id: prompt,
    prompt,
    uc,
    enabled: true,
    center: { x: 0.5, y: 0.5 },
  });
  const build = (model: NovelAIModel) =>
    buildImageRequest({
      input: '1girl, garden',
      negativePrompt: 'my own negative, hat',
      model,
      action: 'generate',
      characters: [character('girl', 'hat')],
      useCoords: false,
      presets: { quality: 'standard', uc: 'light' },
      parameters: {
        params_version: 4,
        width: 832,
        height: 1216,
        scale: 6,
        sampler: 'k_dpmpp_2m',
        steps: 28,
        cfg_rescale: 0.4,
        noise_schedule: 'exponential',
        n_samples: 1,
        seed: 1,
        add_original_image: true,
      },
    });

  it('fixes steps and sampler, and leaves CFG Rescale out', () => {
    const p = build('nai-diffusion-5-full-medium').parameters;
    expect(p.steps).toBe(14);
    expect(p.sampler).toBe('k_euler_ancestral');
    // novelai.net's own Medium request has no cfg_rescale field at all.
    expect(p).not.toHaveProperty('cfg_rescale');
  });

  it('keeps what Medium still lets you set', () => {
    const p = build('nai-diffusion-5-full-medium').parameters;
    expect(p.scale).toBe(6);
    expect(p.noise_schedule).toBe('exponential');
  });

  it('sends the Heavy UC preset’s text alone, and no character negatives', () => {
    const r = build('nai-diffusion-5-full-medium');
    const heavy = composeNegativeWithUc('', 'nai-diffusion-5-full-medium', 'heavy', '1girl, garden');
    expect(getUcText('nai-diffusion-5-full-medium', 'heavy')).toBeTruthy();
    expect(r.parameters.negative_prompt).toBe(heavy);
    expect(r.parameters.negative_prompt).not.toContain('my own negative');
    expect(r.parameters.v4_negative_prompt?.caption.base_caption).toBe(heavy);
    expect(r.parameters.v4_negative_prompt?.caption.char_captions[0].char_caption).toBe('');
    expect(r.parameters.characterPrompts?.[0].uc).toBe('');
    // The character's own prompt is still sent.
    expect(r.parameters.characterPrompts?.[0].prompt).toBe('girl');
  });

  it('says the UC preset is Heavy, keeping the quality preset', () => {
    const p = build('nai-diffusion-5-full-medium').parameters;
    expect(p.ucPresetId).toBe('heavy');
    expect(p.tag_hint_uc_preset).toBe(2);
    expect(p.qualityPresetId).toBe('standard');
  });

  it('changes nothing on High', () => {
    const p = build('nai-diffusion-5-full').parameters;
    expect(p.steps).toBe(28);
    expect(p.sampler).toBe('k_dpmpp_2m');
    expect(p.cfg_rescale).toBe(0.4);
    expect(p.negative_prompt).toBe('my own negative, hat');
    expect(p.ucPresetId).toBe('light');
  });
});

describe('Medium effort price', () => {
  // NovelAI's own price function in its page, at Medium's 14 steps, against
  // High at its default 23 (non-Opus, one image).
  const cases: [number, number, number, number][] = [
    [832, 1216, 17, 26],
    [1216, 832, 17, 26],
    [1024, 1024, 18, 26],
    [512, 768, 8, 11],
    [640, 640, 8, 11],
    [1472, 1472, 35, 54],
  ];
  const cost = (model: NovelAIModel, width: number, height: number, steps: number, strength?: number) =>
    calculateAnlasCost({ model, width, height, steps, smea: false, smeaDyn: false, strength, isOpus: false });

  it.each(cases)('%ix%i: Medium %i, High %i', (w, h, medium, high) => {
    expect(cost('nai-diffusion-5-full-medium', w, h, 14)).toBe(medium);
    expect(cost('nai-diffusion-5-full', w, h, 23)).toBe(high);
  });

  it('always prices Medium at its own step count', () => {
    expect(cost('nai-diffusion-5-full-medium', 832, 1216, 50)).toBe(17);
  });

  it('prices a Medium inpaint by its strength', () => {
    expect(cost('nai-diffusion-5-full-medium-inpainting', 832, 1216, 14, 0.5)).toBe(9);
  });

  it('is free for Opus at Medium', () => {
    expect(
      calculateAnlasCost({ model: 'nai-diffusion-5-full-medium', width: 832, height: 1216, steps: 14, smea: false, smeaDyn: false, isOpus: true }),
    ).toBe(0);
  });

  it('fixes the settings NovelAI fixes', () => {
    expect(MEDIUM_EFFORT).toEqual({ steps: 14, sampler: 'k_euler_ancestral', ucPreset: 'heavy', cfgRescale: 0 });
  });
});

describe('an Effort sweep axis', () => {
  const defaults = { scale: 6, cfgRescale: 0, steps: 28, sampler: 'k_euler_ancestral' as const, seed: 0 };

  it('offers Medium and High', () => {
    const draft = draftFor('effort', defaults, []);
    expect(draft.picked).toEqual(['medium', 'high']);
    expect(toAxis(draft).axis).toEqual({ kind: 'effort', values: ['medium', 'high'] });
  });

  it('sets each cell’s effort, crossed with another axis', () => {
    const cells = sweepCells({ kind: 'effort', values: ['medium', 'high'] }, { kind: 'cfg', values: ['5', '7'] });
    expect(cells.map((c) => [c.effort, c.scale])).toEqual([
      ['medium', 5],
      ['high', 5],
      ['medium', 7],
      ['high', 7],
    ]);
  });

  it('labels the grid', () => {
    expect(axisInfo({ kind: 'effort', values: ['medium', 'high'] }, [])).toEqual({ name: 'Effort', values: ['Medium', 'High'] });
  });

  it('needs at least one level', () => {
    expect(toAxis({ key: 'effort', text: '', picked: [] }).problem).toBeTruthy();
  });
});

describe('a Medium image’s metadata', () => {
  // NovelAI names V5 models by a hash in "Source"; these are the ones its
  // client maps (each a model and its inpainting model).
  const pngWithSource = async (source: string) => {
    const png = await encodePng({ width: 8, height: 8, data: new Uint8ClampedArray(256).fill(255) });
    const chunk = (key: string, text: string) => {
      const data = new TextEncoder().encode(`${key}\0${text}`);
      const out = new Uint8Array(12 + data.length);
      new DataView(out.buffer).setUint32(0, data.length);
      out.set(new TextEncoder().encode('tEXt'), 4);
      out.set(data, 8);
      return out;
    };
    const comment = JSON.stringify({ prompt: '1girl', steps: 14, sampler: 'k_euler_ancestral', seed: 1, width: 8, height: 8 });
    return new Blob([withChunksAfterHeader(png, [chunk('Source', source), chunk('Comment', comment)]) as BlobPart]);
  };

  it.each([
    ['NovelAI Diffusion V5 93F4BD30', 'nai-diffusion-5-full-medium'],
    ['NovelAI Diffusion V5 70AB5786', 'nai-diffusion-5-full-medium'],
    ['NovelAI Diffusion V5 657484A5', 'nai-diffusion-5-full'],
    ['NovelAI Diffusion V5 DB276663', 'nai-diffusion-5-curated'],
  ])('%s is %s', async (source, model) => {
    const { parsed } = await readNaiMetadata(await pngWithSource(source));
    expect(parsed?.guessedModel).toBe(model);
  });
});
