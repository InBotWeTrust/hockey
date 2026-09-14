import { describe, expect, it, vi } from 'vitest';
import { preloadArtwork } from './artworkCache.js';

describe('preloadArtwork', () => {
  it('warms each stable artwork URL once and retains the decoded image', () => {
    const cache = new Map<string, HTMLImageElement>();
    const created: Array<{ decoding: string; fetchPriority: string; src: string }> = [];
    const createImage = vi.fn(() => {
      const image = { decoding: '', fetchPriority: '', src: '' };
      created.push(image);
      return image as HTMLImageElement;
    });

    preloadArtwork(['/background.webp', '/profile.webp'], cache, createImage);
    preloadArtwork(['/profile.webp'], cache, createImage);

    expect(createImage).toHaveBeenCalledTimes(2);
    expect(created).toEqual([
      { decoding: 'async', fetchPriority: 'low', src: '/background.webp' },
      { decoding: 'async', fetchPriority: 'low', src: '/profile.webp' },
    ]);
    expect([...cache.keys()]).toEqual(['/background.webp', '/profile.webp']);
  });
});
