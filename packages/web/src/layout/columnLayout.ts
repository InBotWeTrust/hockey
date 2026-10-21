export interface ColumnLayout {
  count: number;
  columnWidth: number;
  firstIndex: number;
  contentWidth: number;
  gutter: number;
  gap: number;
}
export function calculateColumnLayout({
  width,
  pageCount,
  selectedIndex,
  dockedChat,
}: {
  width: number;
  pageCount: number;
  selectedIndex: number;
  dockedChat: boolean;
}): ColumnLayout {
  const viewport = Number.isFinite(width) ? Math.max(0, width) : 0;
  const contentWidth = Math.max(0, viewport - (dockedChat ? 384 : 0));
  const gutter = contentWidth > 430 ? 24 : 0;
  const gap = 24;
  const available = Math.max(0, contentWidth - 2 * gutter);
  const count = Math.max(
    1,
    Math.min(3, Math.max(1, pageCount), Math.floor((available + gap) / (380 + gap))),
  );
  const columnWidth = Math.min(430, Math.max(0, (available - gap * (count - 1)) / count));
  const selected = Math.max(0, Math.min(Math.max(0, pageCount - 1), selectedIndex));
  const firstIndex = Math.max(0, Math.min(selected, Math.max(0, pageCount - count)));
  return { count, columnWidth, firstIndex, contentWidth, gutter, gap };
}
