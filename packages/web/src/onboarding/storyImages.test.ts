import { describe, expect, it, vi } from 'vitest';
import { prepareStoryImages, storyImagesReady, storyImageUrl } from './storyImages.js';

describe('story image preparation', () => {
  it('versions image URLs and deduplicates loading until decoding completes', async () => {
    let finish!: () => void;
    const decode = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const instances: object[] = [];
    vi.stubGlobal('Image', class {
      decode = decode;
      constructor() { instances.push(this); }
      set src(_value: string) { /* Loading starts through decode. */ }
    });
    const urls = ['/onboarding/story/scene-01-court.webp'];
    expect(storyImageUrl(urls[0]!)).toMatch(/\.webp\?v=[a-f0-9]+$/);
    const first = prepareStoryImages(urls);
    const second = prepareStoryImages(urls);
    expect(instances).toHaveLength(1);
    expect(storyImagesReady(urls)).toBe(false);
    finish();
    await Promise.all([first, second]);
    expect(storyImagesReady(urls)).toBe(true);
    vi.unstubAllGlobals();
  });

  it('allows retry after a decoding failure', async () => {
    let calls = 0;
    vi.stubGlobal('Image', class {
      set src(_value: string) {}
      decode() { return ++calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(); }
    });
    const urls = ['/retry.webp'];
    await expect(prepareStoryImages(urls)).rejects.toThrow('offline');
    expect(storyImagesReady(urls)).toBe(false);
    await prepareStoryImages(urls);
    expect(storyImagesReady(urls)).toBe(true);
    vi.unstubAllGlobals();
  });
});
