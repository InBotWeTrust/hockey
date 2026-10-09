import { FIGHT_ART } from './fightArt.js';
/** The server's shared start is the end of arrival, never a new local gameplay delay. */
export function fightEntranceX(
  width: number,
  side: 0 | 1,
  phaseId: number,
  startsAtMs: number,
  nowMs: number,
  reducedMotion: boolean,
  fighterScale?: number,
  targetX?: number,
): number {
  let target = targetX ?? width * (side === 0 ? 0.25 : 0.75);
  if (fighterScale !== undefined) {
    const frame = FIGHT_ART.frames.idle;
    const left = (frame.offsetX - FIGHT_ART.canvas.width / 2) * fighterScale;
    const right = (frame.offsetX + frame.width - FIGHT_ART.canvas.width / 2) * fighterScale;
    target = Math.max(
      -(side === 0 ? left : -right) + 12,
      Math.min(width - (side === 0 ? right : -left) - 12, target),
    );
  }
  if (reducedMotion || phaseId !== 0 || nowMs >= startsAtMs) return target;
  const progress = Math.max(0, Math.min(1, (nowMs - (startsAtMs - 1000)) / 1000));
  const eased = 1 - (1 - progress) ** 3;
  const origin = width * (side === 0 ? -0.35 : 1.35);
  return origin + (target - origin) * eased;
}
