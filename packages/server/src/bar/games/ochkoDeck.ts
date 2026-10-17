import { randomInt } from 'node:crypto';
import { barOchko, barOchkoSeries } from '@hockey/game-core';
export function createPrivateOchko(now: number, version = 12, character = true) {
  const deck = Array.from({ length: 36 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return version >= 12
    ? barOchkoSeries.create(deck, now, character, randomInt(0x100000000))
    : barOchko.createOchkoFromDeck(deck, now);
}
