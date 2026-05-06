import { createHash } from 'node:crypto';

export function deriveDailySeed(
  userId: string,
  dayDate: string,
  secret: string,
): string {
  return createHash('sha256')
    .update(`${userId}:${dayDate}:${secret}`)
    .digest('hex');
}

export function deriveTrainingSeed(
  userId: string,
  dayDate: string,
  selectedPeriod: number,
  secret: string,
): string {
  return createHash('sha256')
    .update(`${userId}:${dayDate}:training:${selectedPeriod}:${secret}`)
    .digest('hex');
}

export function deriveAmateurDuelSeed(
  matchId: string,
  challengerUserId: string,
  opponentUserId: string,
  acceptedAtIso: string,
  secret: string,
): string {
  return createHash('sha256')
    .update(`${matchId}:${challengerUserId}:${opponentUserId}:amateur_duel:${acceptedAtIso}:${secret}`)
    .digest('hex');
}

// Per-shot seed derivation lives in @hockey/game-core so the client uses
// the exact same function (cross-client determinism for the gybrid
// simulation). Re-export here so server callers can import from one place.
export { deriveShotSeed } from '@hockey/game-core';
