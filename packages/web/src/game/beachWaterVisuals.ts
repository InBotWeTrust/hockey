import { sampleBeachPuddles, PUCK_START, GOAL_OPENING,
  PERSPECTIVE_COURT_VISUAL_Y_SCALE, PERSPECTIVE_COURT_VISUAL_Y_OFFSET,
  PERSPECTIVE_COURT_PUCK_BLADE_OFFSET_Y, PERSPECTIVE_COURT_PUCK_FLIGHT_VISUAL_Y_OFFSET,
  type BeachPuddle, type BeachPuddleRule } from '@hockey/game-core';

/** Same release-to-goal projection as the existing puck, driven by distance rather than flight time. */
export function projectBeachWaterY(y: number): number {
  const progress = (PUCK_START.y - y) / (PUCK_START.y - GOAL_OPENING.y);
  return (y + PERSPECTIVE_COURT_PUCK_BLADE_OFFSET_Y * (1 - progress)) * PERSPECTIVE_COURT_VISUAL_Y_SCALE
    + PERSPECTIVE_COURT_VISUAL_Y_OFFSET + PERSPECTIVE_COURT_PUCK_FLIGHT_VISUAL_Y_OFFSET * progress;
}
export function createBeachWaterSampler(rules: readonly BeachPuddleRule[]): (time: number, frozenTime: number | null) => BeachPuddle[] {
  let frozen: BeachPuddle[] | null = null;
  let frozenAt: number | null = null;
  let thawAt: number | null = null;
  return (time, frozenTime) => {
    if (frozenTime !== null) {
      if (frozenAt !== frozenTime) frozen = sampleBeachPuddles(rules, frozenTime);
      frozenAt = frozenTime;
      thawAt = null;
      return frozen!;
    }
    const current = sampleBeachPuddles(rules, time);
    if (!frozen) return current;
    thawAt ??= time;
    const progress = Math.min(1, Math.max(0, (time - thawAt) / 250));
    if (progress === 1) { frozen = null; frozenAt = null; return current; }
    return current.map(puddle => {
      const before = frozen!.find(item => item.id === puddle.id);
      return { ...puddle,
        radiusX: (before?.radiusX ?? 0) + (puddle.radiusX - (before?.radiusX ?? 0)) * progress,
        radiusY: (before?.radiusY ?? 0) + (puddle.radiusY - (before?.radiusY ?? 0)) * progress,
      };
    });
  };
}
