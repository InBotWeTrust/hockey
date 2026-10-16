import { randomInt } from 'node:crypto';
import { barOchko } from '@hockey/game-core';
export function createPrivateOchko(now: number) {
  const deck = Array.from({ length: 36 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return barOchko.createOchkoFromDeck(deck, now);
}
