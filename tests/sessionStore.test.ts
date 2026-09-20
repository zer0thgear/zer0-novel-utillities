import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/sessionStore';
import { GeneratedImage } from '@/types/novelai';

// Object URLs aren't a thing in node, and the store revokes them as it goes.
beforeEach(() => {
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake');
  globalThis.URL.revokeObjectURL = vi.fn();
  useSessionStore.setState({ images: [], focusedImageId: null, focusedGroupId: null });
});

const image = (id: string, over: Partial<GeneratedImage> = {}): GeneratedImage =>
  ({
    id,
    url: `blob:${id}`,
    blob: new Blob(),
    prompt: '1girl',
    negativePrompt: '',
    model: 'nai-diffusion-5-full',
    parameters: { width: 832, height: 1216, steps: 23, seed: 1 },
    timestamp: 0,
    seed: 1,
    ...over,
  }) as GeneratedImage;

const store = () => useSessionStore.getState();
const seed = (...images: GeneratedImage[]) =>
  useSessionStore.setState({ images, focusedImageId: images[0]?.id ?? null, focusedGroupId: null });

describe('removeImages', () => {
  it('removes several at once and frees their URLs', () => {
    seed(image('a'), image('b'), image('c'));
    store().removeImages(['a', 'c']);
    expect(store().images.map((i) => i.id)).toEqual(['b']);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:c');
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:b');
  });

  it('moves the focus off a removed image, to the newest left', () => {
    seed(image('a'), image('b'));
    store().removeImages(['a']);
    expect(store().focusedImageId).toBe('b');
  });

  it('leaves the focus alone when it survives', () => {
    seed(image('a'), image('b'));
    useSessionStore.setState({ focusedImageId: 'b' });
    store().removeImages(['a']);
    expect(store().focusedImageId).toBe('b');
  });

  it('goes back to the group grid when some of it is left', () => {
    seed(image('a', { batchId: 'g' }), image('b', { batchId: 'g' }));
    useSessionStore.setState({ focusedImageId: 'a', focusedGroupId: 'g' });
    store().removeImages(['a']);
    expect(store().focusedImageId).toBeNull();
    expect(store().focusedGroupId).toBe('g');
  });

  it('drops the group once its last image goes', () => {
    seed(image('a', { batchId: 'g' }), image('b'));
    useSessionStore.setState({ focusedImageId: 'a', focusedGroupId: 'g' });
    store().removeImages(['a']);
    expect(store().focusedGroupId).toBeNull();
    expect(store().focusedImageId).toBe('b');
  });

  it('is what removeImage does with one id', () => {
    seed(image('a'), image('b'));
    store().removeImage('a');
    expect(store().images.map((i) => i.id)).toEqual(['b']);
  });
});

describe('pinning', () => {
  it('toggles on and off', () => {
    seed(image('a'));
    store().togglePin('a');
    expect(store().images[0].pinned).toBe(true);
    store().togglePin('a');
    expect(store().images[0].pinned).toBe(false);
  });

  it('keeps pinned images through a clear, and frees only the rest', () => {
    seed(image('a', { pinned: true }), image('b'));
    store().clearImages();
    expect(store().images.map((i) => i.id)).toEqual(['a']);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:b');
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:a');
  });

  it('leaves the focus on a pinned image, or moves it to one', () => {
    seed(image('a', { pinned: true }), image('b'));
    useSessionStore.setState({ focusedImageId: 'b', focusedGroupId: 'g' });
    store().clearImages();
    expect(store().focusedImageId).toBe('a');
    expect(store().focusedGroupId).toBeNull();
  });

  it('empties the session when nothing is pinned', () => {
    seed(image('a'), image('b'));
    store().clearImages();
    expect(store().images).toEqual([]);
    expect(store().focusedImageId).toBeNull();
  });
});
