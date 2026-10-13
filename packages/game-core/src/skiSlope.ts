/** Directional clock for triangular board-to-board movement, with the left side downhill.
 * Apply after integrating shot/rest pauses. Phase offsets remain unchanged at time zero.
 * Additive prototype helper: no existing attempt uses it until explicitly opted in.
 */
export function skiSlopeMotionTime(timeMs: number, frequency: number, phaseOffsetMs = 0): number {
  if (frequency <= 0) return timeMs;
  const period = 1000 / frequency;
  const half = period / 2;
  const uphill = half / 0.65;
  const cycle = uphill + half / 1.25;
  const travel = (phase: number): number => {
    const cycles = Math.floor(phase / period);
    const local = phase - cycles * period;
    return cycles * cycle + (local <= half ? local / 0.65 : uphill + (local - half) / 1.25);
  };
  const elapsed = travel(phaseOffsetMs) + timeMs;
  const cycles = Math.floor(elapsed / cycle);
  const local = elapsed - cycles * cycle;
  return (
    cycles * period +
    (local <= uphill ? local * 0.65 : half + (local - uphill) * 1.25) -
    phaseOffsetMs
  );
}
