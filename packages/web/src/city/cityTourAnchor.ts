/** Attach to the visible span of a location, following the card rather than its fixed center. */
export function cityTourAnchor(
  left: number,
  right: number,
  viewportWidth: number,
  preferred: number,
): number | null {
  const visibleLeft = Math.max(12, left),
    visibleRight = Math.min(viewportWidth - 12, right);
  if (visibleRight < visibleLeft) return null;
  return Math.max(visibleLeft, Math.min(visibleRight, preferred));
}
