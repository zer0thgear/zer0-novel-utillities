import { describe, expect, it } from 'vitest';
import { filterImages, imageMatches, queryTerms } from '@/lib/historyFilter';
import { GeneratedImage, NovelAIModel } from '@/types/novelai';

const QUALITY = 'very aesthetic, masterpiece, no text';

/** An image the way this app records one: the prompt as sent (quality tags
 *  and all), the prompt as written, and its character prompts. */
const image = (
  written: string,
  over: Partial<GeneratedImage> & { characters?: string[]; seed?: number } = {},
): GeneratedImage => {
  const { characters = [], seed = 1234567, ...rest } = over;
  return {
    id: 'i1',
    url: 'blob:x',
    blob: new Blob(),
    prompt: `${written}, ${QUALITY}`,
    negativePrompt: 'lowres, bad quality',
    model: 'nai-diffusion-5-full' as NovelAIModel,
    parameters: {
      width: 832,
      height: 1216,
      steps: 23,
      seed,
      characterPrompts: characters.map((prompt) => ({ prompt, uc: '', center: { x: 0.5, y: 0.5 }, enabled: true })),
    },
    timestamp: 0,
    seed,
    source: {
      prompt: written,
      negativePrompt: 'lowres',
      modifiers: { furMode: false, nsfwMode: false, transparentBg: false, qualityPreset: 'standard', ucPreset: 'heavy' },
    },
    ...rest,
  } as GeneratedImage;
};

describe('queryTerms', () => {
  it('splits on commas, as a prompt is written', () => {
    expect(queryTerms('blue hair, smile')).toEqual(['blue hair', 'smile']);
  });

  it('tidies case and spacing, and drops empties', () => {
    expect(queryTerms('  Blue   Hair ,, SMILE ,')).toEqual(['blue hair', 'smile']);
    expect(queryTerms('   ')).toEqual([]);
  });
});

describe('imageMatches', () => {
  // The case that was backwards: blue eyes and black hair is not blue hair.
  const eyesAndHair = image('1girl, blue eyes, black hair, smile');
  const blueHair = image('1girl, blue hair, smile');

  it('treats a multi-word tag as one phrase', () => {
    expect(imageMatches(blueHair, 'blue hair')).toBe(true);
    expect(imageMatches(eyesAndHair, 'blue hair')).toBe(false);
  });

  it('wants every tag, in any order', () => {
    expect(imageMatches(blueHair, 'smile, blue hair')).toBe(true);
    expect(imageMatches(blueHair, 'blue hair, frown')).toBe(false);
  });

  it('finds part of a tag', () => {
    expect(imageMatches(blueHair, 'hair')).toBe(true);
    expect(imageMatches(image('1girl, long blue hair'), 'blue hair')).toBe(true);
  });

  it('ignores case, stray spaces and a trailing comma', () => {
    expect(imageMatches(blueHair, 'Blue  Hair,')).toBe(true);
  });

  it('matches everything on an empty or blank query', () => {
    expect(imageMatches(blueHair, '')).toBe(true);
    expect(imageMatches(blueHair, ' , ')).toBe(true);
  });

  it('searches character prompts, where V4+ puts much of the description', () => {
    const scene = image('scenery, park', { characters: ['1girl, blue hair, smile', '1boy, red scarf'] });
    expect(imageMatches(scene, 'blue hair')).toBe(true);
    expect(imageMatches(scene, 'red scarf')).toBe(true);
    // Tags from different characters still count as all being there.
    expect(imageMatches(scene, 'blue hair, red scarf')).toBe(true);
  });

  it('never matches a tag across two fields', () => {
    const scene = image('scenery, park', { characters: ['smile'] });
    expect(imageMatches(scene, 'park smile')).toBe(false);
  });

  it('does not match the quality tags every image shares', () => {
    expect(imageMatches(blueHair, 'masterpiece')).toBe(false);
  });

  it('falls back to the prompt as sent when there is no written one', () => {
    const imported = { ...blueHair, source: undefined };
    expect(imageMatches(imported, 'blue hair')).toBe(true);
  });

  it('leaves the negative prompt out', () => {
    expect(imageMatches(blueHair, 'lowres')).toBe(false);
  });

  it('matches a number only as a whole seed', () => {
    expect(imageMatches(blueHair, '1234567')).toBe(true);
    // Not every seed with a 4 in it.
    expect(imageMatches(blueHair, '4')).toBe(false);
    expect(imageMatches(blueHair, '123')).toBe(false);
  });

  it('matches the model, and a chain or sweep the image came from', () => {
    expect(imageMatches(blueHair, 'v5 full')).toBe(true);
    expect(imageMatches(blueHair, 'v4.5')).toBe(false);

    const chained = image('1girl', {
      chain: { runId: 'r', chainId: 'c', name: 'Polish', step: 1, total: 2, label: 'Enhance ×1.5' },
    });
    expect(imageMatches(chained, 'polish')).toBe(true);
    expect(imageMatches(chained, 'enhance')).toBe(true);

    const swept = image('1girl', { sweep: { id: 's', x: { name: 'CFG', values: ['4', '5'] }, xIndex: 0 } });
    expect(imageMatches(swept, 'cfg')).toBe(true);
  });

  it('mixes kinds of tag in one query', () => {
    expect(imageMatches(blueHair, 'blue hair, 1234567, v5')).toBe(true);
  });
});

describe('filterImages', () => {
  const images = [
    image('1girl, blue eyes, black hair', { id: 'a' }),
    image('1girl, blue hair', { id: 'b' }),
    image('scenery', { id: 'c', characters: ['1boy, blue hair'] }),
  ];

  it('narrows to the matches, keeping their order', () => {
    expect(filterImages(images, 'blue hair').map((i) => i.id)).toEqual(['b', 'c']);
    expect(filterImages(images, 'black hair').map((i) => i.id)).toEqual(['a']);
    expect(filterImages(images, 'nothing')).toEqual([]);
  });

  it('returns the same array when there is nothing to filter by', () => {
    expect(filterImages(images, '  ')).toBe(images);
    expect(filterImages(images, ' , ')).toBe(images);
  });
});
