const CHAT_AVATAR_SOURCE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const CHAT_AVATAR_SOURCE_MAX_BYTES = 8 * 1024 * 1024;
const CHAT_AVATAR_WEBP_MAX_BYTES = 2 * 1024 * 1024;
const CHAT_AVATAR_SIZE = 512;
const chatAvatarWebpQualities = [0.9, 0.82, 0.74, 0.66, 0.58];

function loadChatAvatarImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать изображение.'));
    };
    image.src = url;
  });
}

function canvasToWebpBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/webp', quality);
  });
}

export async function convertChatAvatarToWebp(file: File): Promise<File> {
  if (!CHAT_AVATAR_SOURCE_TYPES.has(file.type)) {
    throw new Error('Аватар должен быть изображением JPG, PNG или WebP.');
  }
  if (file.size > CHAT_AVATAR_SOURCE_MAX_BYTES) {
    throw new Error('Аватар слишком большой. Лимит: 8 МБ.');
  }
  if (file.type === 'image/webp' && file.size <= CHAT_AVATAR_WEBP_MAX_BYTES) {
    return file;
  }

  const image = await loadChatAvatarImage(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const cropSize = Math.min(sourceWidth, sourceHeight);
  if (!Number.isFinite(cropSize) || cropSize <= 0) {
    throw new Error('Не удалось прочитать размер изображения.');
  }

  const canvas = document.createElement('canvas');
  const outputSize = Math.min(CHAT_AVATAR_SIZE, cropSize);
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Браузер не смог подготовить аватар.');
  const sx = Math.max(0, (sourceWidth - cropSize) / 2);
  const sy = Math.max(0, (sourceHeight - cropSize) / 2);
  ctx.drawImage(image, sx, sy, cropSize, cropSize, 0, 0, outputSize, outputSize);

  let lastBlob: Blob | null = null;
  for (const quality of chatAvatarWebpQualities) {
    const blob = await canvasToWebpBlob(canvas, quality);
    if (!blob) continue;
    lastBlob = blob;
    if (blob.size <= CHAT_AVATAR_WEBP_MAX_BYTES) {
      return new File([blob], 'chat-avatar.webp', { type: 'image/webp' });
    }
  }
  if (!lastBlob) throw new Error('Браузер не поддерживает сохранение WebP.');
  throw new Error('Не удалось ужать аватар до 2 МБ.');
}
