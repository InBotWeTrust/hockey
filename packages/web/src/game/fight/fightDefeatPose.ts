import type { FighterPose } from './Fighter.js';
export function fightDefeatPose(
  hp: number,
  loser: boolean,
  nowMs: number,
  hitUntilMs: number,
): FighterPose | null {
  if (nowMs < hitUntilMs) return 'hit';
  if (hp === 0 || loser) return 'lose';
  return null;
}
