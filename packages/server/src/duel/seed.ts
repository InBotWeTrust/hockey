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

// Per-shot seed derivation lives in @hockey/game-core so the client uses
// the exact same function (cross-client determinism for the gybrid
// simulation). Re-export here so server callers can import from one place.
export { deriveShotSeed } from '@hockey/game-core';
