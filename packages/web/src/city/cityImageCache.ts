interface DecodedImage {
  image: HTMLImageElement;
  ready: boolean;
  promise: Promise<void>;
}

// Keep only the current and preceding lighting textures alive between route mounts.
const images = new Map<string, DecodedImage>();
const MAX_IMAGES = 2;

export function isCityImageReady(src: string): boolean {
  return images.get(src)?.ready === true;
}

export function prepareCityImage(src: string): Promise<void> {
  const cached = images.get(src);
  if (cached) {
    images.delete(src);
    images.set(src, cached);
    return cached.promise;
  }
  const image = new Image();
  const entry: DecodedImage = {image, ready: false, promise: Promise.resolve()};
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('City background failed to load'));
  });
  image.src = src;
  // Older WebViews may not expose decode().
  entry.promise = (typeof image.decode === 'function' ? image.decode() : loaded)
    .then(() => {entry.ready = true;})
    .catch((error: unknown) => {
      if (images.get(src) === entry) images.delete(src);
      throw error;
    });
  // decode() owns errors on modern browsers; do not leave a separate rejection unhandled.
  void loaded.catch(() => undefined);
  images.set(src, entry);
  while (images.size > MAX_IMAGES) images.delete(images.keys().next().value!);
  return entry.promise;
}
