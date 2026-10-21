export interface ChatSheetHeight {
  height: number;
  compactHeight: number;
}
const DEFAULT_HEIGHT: ChatSheetHeight = { height: 0.55, compactHeight: 0.55 };
const keyFor = (owner?: string) => `chat-sheet-height-v1:${owner ?? 'anonymous'}`;
export function clampChatSheetHeight(height: number): number {
  return Number.isFinite(height) ? Math.max(1 / 3, Math.min(1, height)) : 0.55;
}
export function readChatSheetHeight(owner?: string): ChatSheetHeight {
  try {
    const saved = JSON.parse(localStorage.getItem(keyFor(owner)) ?? 'null');
    if (!saved || !Number.isFinite(saved.height) || !Number.isFinite(saved.compactHeight))
      return { ...DEFAULT_HEIGHT };
    return {
      height: clampChatSheetHeight(saved.height),
      compactHeight: saved.compactHeight < 1 ? clampChatSheetHeight(saved.compactHeight) : 0.55,
    };
  } catch {
    return { ...DEFAULT_HEIGHT };
  }
}
export function withChatSheetHeight(previous: ChatSheetHeight, height: number): ChatSheetHeight {
  const next = clampChatSheetHeight(height);
  return { height: next, compactHeight: next < 1 ? next : previous.compactHeight };
}
export function saveChatSheetHeight(owner: string | undefined, height: ChatSheetHeight): void {
  try {
    localStorage.setItem(keyFor(owner), JSON.stringify(height));
  } catch {
    /* Persistence is optional. */
  }
}
