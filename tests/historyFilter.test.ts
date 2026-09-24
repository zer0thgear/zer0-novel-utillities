import { describe, expect, it } from 'vitest';
import { filterImages, imageMatches } from '@/lib/historyFilter';
import { GeneratedImage, NovelAIModel } from '@/types/novelai';

const image = (over: Partial<GeneratedImage> = {}): GeneratedImage =>
  ({
    id: over.id ?? 'i1',
    url: 'blob:x',
    blob: new Blob(),
    prompt: '1girl, red umbrella, rain',
    negativePrompt: '',
    model: 'nai-diffusion-5-full' as NovelAIModel,
    parameters: { width: 832, height: 1216, steps: 23, seed: 777 },
    timestamp: 0,
    seed: 777,
    ...over,
  }) as GeneratedImage;

describe('imageMatches', () => {
  it('matches anywhere in the prompt, ignoring case', () => {
    expect(imageMatches(image(), 'umbrella')).toBe(true);
    expect(imageMatches(image(), 'UMBRELLA')).toBe(true);
    expect(imageMatches(image(), 'parasol')).toBe(false);
  });

  it('wants every word, in any order', () => {
    expect(imageMatches(image(), 'red rain')).toBe(true);
    expect(imageMatches(image(), 'rain red')).toBe(true);
    expect(imageMatches(image(), 'red sunshine')).toBe(false);
  });

  it('matches everything on an empty or blank query', () => {
    expect(imageMatches(image(), '')).toBe(true);
    expect(imageMatches(image(), '   ')).toBe(true);
  });

  it('searches the prompt as written, not just as sent', () => {
    const img = image({
      prompt: '1girl, very aesthetic, masterpiece',
      source: { prompt: '1girl, __Weather__', negativePrompt: '', modifiers: {} } as GeneratedImage['source'],
    });
    expect(imageMatches(img, 'weather')).toBe(true);
  });

  it('searches character prompts, not just the base prompt', () => {
    const img = image({
      prompt: '2girls, park',
      parameters: {
        width: 832, height: 1216, steps: 23, seed: 777,
        characterPrompts: [
          { prompt: 'girl, blue dress', uc: '', center: { x: 0.3, y: 0.5 }, enabled: true },
          { prompt: 'girl, red umbrella', uc: 'hat', center: { x: 0.7, y: 0.5 }, enabled: true },
        ],
      },
    } as Partial<GeneratedImage>);
    expect(imageMatches(img, 'umbrella')).toBe(true);
    expect(imageMatches(img, 'park dress umbrella')).toBe(true);
    // A character's negative isn't what the image shows, so it isn't searched.
    expect(imageMatches(img, 'hat')).toBe(false);
  });

  it('falls back to v4 captions when there are no characterPrompts', () => {
    const img = image({
      prompt: '1girl',
      parameters: {
        width: 832, height: 1216, steps: 23, seed: 777,
        v4_prompt: { caption: { base_caption: '1girl', char_captions: [{ char_caption: 'girl, witch hat', centers: [{ x: 0.5, y: 0.5 }] }] }, use_coords: false, use_order: true },
      },
    } as Partial<GeneratedImage>);
    expect(imageMatches(img, 'witch')).toBe(true);
  });

  it('searches the model name and the seed', () => {
    expect(imageMatches(image(), 'v5 full')).toBe(true);
    expect(imageMatches(image(), '777')).toBe(true);
    expect(imageMatches(image(), 'v4.5')).toBe(false);
  });

  it('searches a chain or sweep the image belongs to', () => {
    const chained = image({ chain: { runId: 'r', chainId: 'c', name: 'Polish', step: 1, total: 2, label: 'Enhance ×1.5' } });
    expect(imageMatches(chained, 'polish')).toBe(true);
    expect(imageMatches(chained, 'enhance')).toBe(true);

    const swept = image({
      sweep: { id: 's', x: { name: 'CFG', values: ['4', '5'] }, xIndex: 0 },
    } as Partial<GeneratedImage>);
    expect(imageMatches(swept, 'cfg')).toBe(true);
  });
});

describe('filterImages', () => {
  const images = [image({ id: 'a' }), image({ id: 'b', prompt: '1boy, sunny day' })];

  it('keeps the order it was given', () => {
    expect(filterImages(images, '1').map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('returns the same array when there is nothing to filter by', () => {
    expect(filterImages(images, '  ')).toBe(images);
  });

  it('narrows to the matches', () => {
    expect(filterImages(images, 'sunny').map((i) => i.id)).toEqual(['b']);
    expect(filterImages(images, 'nothing')).toEqual([]);
  });
});
