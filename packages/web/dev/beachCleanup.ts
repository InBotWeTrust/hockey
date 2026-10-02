import { sampleBeachPuddles, type BeachPuddleRule } from '@hockey/game-core';
/** Local probe only: edits a private fixture copy, never persisted snapshots. */
export function createBeachCleanup(rules: BeachPuddleRule[]) {
  let lastTap = -Infinity;
  return (x: number, y: number, time: number): boolean => {
    const puddle = sampleBeachPuddles(rules, time).reverse().find(p => p.active &&
      ((x - p.x) / p.radiusX) ** 2 + ((y - p.y) / p.radiusY) ** 2 <= 1);
    if (!puddle) return false;
    if (time - lastTap < 180) return true;
    lastTap = time;
    const rule = rules.find(p => p.id === puddle.id)!;
    const area = (puddle.radiusX / rule.radiusX) ** 2;
    const remaining = area - .125;
    rule.initialScale = remaining > .01 ? Math.sqrt(remaining) : .025;
    rule.warningMs = rule.activeMs = time + (remaining > .01 ? 0 : 1500);
    rule.fullMs = rule.activeMs + 30000;
    return true;
  };
}
