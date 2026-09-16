import { describe, expect, it, vi } from 'vitest';
import { preloadArtwork, preloadStartupArtwork, startupArtworkUrls } from './artworkCache.js';

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

  it('uses the signed-in player level for the first arena background and cube', () => {
    expect(startupArtworkUrls('beginner')).toEqual([
      '/backgrounds/arena-beginner-reference-v8.webp',
      '/sprites/app-arena-cube-beginner.webp',
      '/sprites/app-arena-ice.webp',
    ]);
    expect(startupArtworkUrls('amateur')).toEqual([
      '/backgrounds/arena-amateur-reference-v6.webp',
      '/sprites/app-arena-cube-amateur.webp',
      '/sprites/app-arena-ice.webp',
    ]);
    expect(startupArtworkUrls('professional')).toEqual([
      '/sprites/app-arena-ice.webp',
      '/sprites/app-arena-cube.webp',
    ]);
  });

  it('waits for the selected-level artwork to decode before releasing the startup screen', async () => {
    const resolveDecodes: Array<() => void> = [];
    const decode = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDecodes.push(resolve);
        }),
    );
    const createImage = vi.fn(
      () => ({ decoding: '', fetchPriority: '', src: '', decode }) as unknown as HTMLImageElement,
    );

    const preloading = preloadStartupArtwork('amateur', new Map(), createImage);

    expect(createImage).toHaveBeenCalledTimes(3);
    expect(decode).toHaveBeenCalledTimes(3);
    resolveDecodes.forEach((resolve) => resolve());
    await preloading;
  });
});
