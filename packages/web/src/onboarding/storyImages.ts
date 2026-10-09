import { storyImageVersions } from './storyImageVersions.js';

const loading = new Map<string, Promise<void>>();
const decoded = new Set<string>();

export function storyImageUrl(url: string): string {
  const version = storyImageVersions[url.split('/').pop() ?? ''];
  return version ? `${url}?v=${version}` : url;
}

export function storyImagesReady(urls: string[]): boolean {
  return urls.every(url => decoded.has(storyImageUrl(url)));
}

export function prepareStoryImages(urls: string[]): Promise<void> {
  return Promise.all(urls.map(raw => {
    const url = storyImageUrl(raw);
    const existing = loading.get(url);
    if (existing) return existing;
    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = raw.includes('scene-01-court') || raw.includes('/amateur/scene-01-') ? 'high' : 'low';
    image.src = url;
    const promise = image.decode().then(() => { decoded.add(url); }).catch((error: unknown) => {
      loading.delete(url);
      throw error;
    });
    loading.set(url, promise);
    return promise;
  })).then(() => undefined);
}
