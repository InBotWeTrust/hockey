import { randomInt } from 'node:crypto';
import { barOchko, barOchkoSeries, ENGINE_VERSION } from '@hockey/game-core';
export function createPrivateOchko(now: number, version = ENGINE_VERSION, character = true) {
  const deck = Array.from({ length: 36 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return version >= 12
    ? barOchkoSeries.create(deck, now, character, randomInt(0x100000000), version >= 17 ? 3000 : undefined, version >= 20 && character ? 5 : 4)
    : barOchko.createOchkoFromDeck(deck, now);
}
