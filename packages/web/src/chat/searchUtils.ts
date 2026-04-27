function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function excerptAround(
  text: string,
  tokens: string[],
  ctxBefore = 40,
  ctxAfter = 120,
): string {
  if (text.length <= ctxBefore + ctxAfter) return text;

  let firstMatch = -1;
  for (const t of tokens) {
    if (!t) continue;
    const re = new RegExp(escapeRegex(t), 'i');
    const m = text.match(re);
    if (m && m.index !== undefined && (firstMatch === -1 || m.index < firstMatch)) {
      firstMatch = m.index;
    }
  }

  if (firstMatch === -1) {
    return text.slice(0, ctxBefore + ctxAfter);
  }

  const start = Math.max(0, firstMatch - ctxBefore);
  const end = Math.min(text.length, firstMatch + ctxAfter);
  const slice = text.slice(start, end);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${slice}${suffix}`;
}
