import { durak, type durakTable } from '@hockey/game-core';
export type DurakAchievementTelemetry = {
  participated: boolean[];
  trumpsReceived: number[];
  tookTable: boolean[];
  bestDefendedRound: number[];
  allSixAttacks: boolean[];
  finalRoundSixes: number[];
  roundInitial: number[];
  roundPlayed: durak.Card[][];
  roundAttacks: number[];
};
type CardGame = { hands: durak.Card[][]; trump: durak.Suit; table: durak.Pair[] };
export function createDurakAchievementTelemetry(game: CardGame): DurakAchievementTelemetry {
  const seats = game.hands.length;
  return {
    participated: Array(seats).fill(false),
    trumpsReceived: game.hands.map((h) => h.filter((c) => c.suit === game.trump).length),
    tookTable: Array(seats).fill(false),
    bestDefendedRound: Array(seats).fill(0),
    allSixAttacks: Array(seats).fill(false),
    finalRoundSixes: Array(seats).fill(0),
    roundInitial: game.hands.map((h) => h.length),
    roundPlayed: game.hands.map(() => []),
    roundAttacks: Array(seats).fill(0),
  };
}
function observeCards(
  t: DurakAchievementTelemetry,
  before: CardGame,
  after: CardGame,
  actor: number,
  action: durak.Action | durakTable.TableAction,
  defender: number,
  taking: boolean,
  finished: number[],
) {
  for (let p = 0; p < after.hands.length; p++) {
    const previous = new Set(before.hands[p]!.map((c) => c.id));
    t.trumpsReceived[p]! += after.hands[p]!.filter(
      (c) => c.suit === after.trump && !previous.has(c.id),
    ).length;
  }
  const table = before.table.map((p) => ({ ...p }));
  if (action.type === 'play' || action.type === 'beat') {
    const card = before.hands[actor]!.find((c) => c.id === action.cardId);
    if (card) {
      t.roundPlayed[actor]!.push(card);
      if (action.type === 'play') {
        t.roundAttacks[actor]!++;
        table.push({ attack: card });
        if (t.roundInitial[actor] === 6 && t.roundAttacks[actor] === 6)
          t.allSixAttacks[actor] = true;
      } else if (table[action.target]) table[action.target]!.defence = card;
    }
  }
  if (action.type === 'take') t.tookTable[actor] = true;
  const settled = table.length > 0 && after.table.length === 0;
  if (settled && !taking && table.every((pair) => pair.defence))
    t.bestDefendedRound[defender] = Math.max(t.bestDefendedRound[defender]!, table.length);
  for (const p of finished) {
    const last = t.roundPlayed[p]!.slice(-2);
    t.finalRoundSixes[p] = last.length === 2 && last.every((c) => c.rank === 6) ? 2 : 0;
  }
  if (settled) {
    t.roundInitial = after.hands.map((h) => h.length);
    t.roundPlayed = after.hands.map(() => []);
    t.roundAttacks = after.hands.map(() => 0);
  }
  return t;
}
export function observeDurakGameTransition(
  t: DurakAchievementTelemetry,
  before: durak.Game,
  after: durak.Game,
  actor: durak.Player,
  action: durak.Action,
): DurakAchievementTelemetry {
  return observeCards(
    t,
    before,
    after,
    actor,
    action,
    durak.other(before.attacker),
    before.phase === 'taking' || action.type === 'take',
    after.result === 0 || after.result === 1 ? [after.result] : [],
  );
}
export function observeDurakTableTransition(
  t: DurakAchievementTelemetry,
  before: durakTable.TableGame,
  after: durakTable.TableGame,
  actor: number,
  action: durakTable.TableAction,
) {
  const won = after.status.flatMap((s, p) =>
    s === 'won' && before.status[p] !== 'won' ? [p] : [],
  );
  return observeCards(
    t,
    before,
    after,
    actor,
    action,
    before.defender,
    before.taking || action.type === 'take',
    won,
  );
}
export function qualifiersForDurakPlayer(
  t: DurakAchievementTelemetry,
  player: number,
  won = false,
): Record<number, number> {
  const q: Record<number, number> = {};
  if (won) {
    if (t.trumpsReceived[player]! <= 3) q[38] = 2;
    else if (t.trumpsReceived[player]! <= 5) q[38] = 1;
    if (t.finalRoundSixes[player]! >= 2) q[39] = 1;
    if (!t.tookTable[player]) q[41] = 1;
  }
  if (t.bestDefendedRound[player]! >= 6) q[40] = 3;
  else if (t.bestDefendedRound[player]! >= 4) q[40] = 2;
  else if (t.bestDefendedRound[player]! >= 2) q[40] = 1;
  if (t.allSixAttacks[player]) q[42] = 1;
  return q;
}
