export interface ChatRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export function clampChatRect(
  rect: ChatRect,
  viewport: { width: number; height: number },
): ChatRect {
  const maxWidth = Math.max(0, viewport.width - 24),
    maxHeight = Math.max(0, viewport.height - 24);
  const width = Math.min(maxWidth, Math.max(Math.min(320, maxWidth), rect.width));
  const height = Math.min(maxHeight, Math.max(Math.min(320, maxHeight), rect.height));
  const margin = viewport.width >= 24 && viewport.height >= 24 ? 12 : 0;
  return {
    width,
    height,
    x: Math.max(margin, Math.min(rect.x, viewport.width - width - margin)),
    y: Math.max(margin, Math.min(rect.y, viewport.height - height - margin)),
  };
}
