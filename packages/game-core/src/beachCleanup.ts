import { sampleBeachPuddles, type BeachPuddleRule } from './beachEnvironment.js';
export interface BeachCleanupEvent { id: string; puddleId: string; tapTime: number }
/** Rebuild current geometry from immutable initial rules and accepted ordered events. */
export function beachCleanupRules(initial: readonly BeachPuddleRule[], events: readonly BeachCleanupEvent[], time: number): BeachPuddleRule[] {
  const rules = initial.map(rule => ({ ...rule }));
  for (const event of events) {
    if (event.tapTime > time) break;
    const rule = rules.find(rule => rule.id === event.puddleId);
    const puddle = sampleBeachPuddles(rules, event.tapTime).find(puddle => puddle.id === event.puddleId && puddle.active);
    if (!rule || !puddle) continue;
    const area = (puddle.radiusX / rule.radiusX) ** 2 - .125;
    rule.initialScale = area > .01 ? Math.sqrt(area) : .025;
    rule.warningMs = rule.activeMs = event.tapTime + (area > .01 ? 0 : 1500);
    rule.fullMs = rule.activeMs + 30000;
  }
  return rules;
}
