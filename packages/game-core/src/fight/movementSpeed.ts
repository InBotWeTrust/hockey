/** Saved fight rules retain their original movement speed. */
export const FIGHT_MOVE_SPEED = 0.0003;
export function fightMoveSpeed(version: number): number {
  return version >= 6 ? 0.0004 : FIGHT_MOVE_SPEED;
}
