import { durak } from '@hockey/game-core';
export const TURN_MS = 20_000;
export function advanceDeadline(game: durak.Game, deadline: number, now: number) {
  let next = game;
  let until = deadline;
  // A persisted deadline is never extended by reading/reconnecting.
  for (let i = 0; next.result === null && until <= now && i < 1000; i++) {
    const player = durak.activePlayer(next);
    const action = durak.timeoutAction(next, player);
    if (!action) break;
    next = durak.applyAction(next, player, action);
    until += TURN_MS;
  }
  return { game: next, deadline: until };
}
export function projectGame(game: durak.Game, player: durak.Player) {
  return {
    hand: game.hands[player],
    opponentCount: game.hands[durak.other(player)].length,
    deckCount: game.deck.length,
    trump: game.trump,
    trumpCard: game.trumpCard,
    attacker: game.attacker === player ? 0 : 1,
    table: game.table,
    limit: game.limit,
    phase: game.phase,
    revision: game.revision,
    result:
      game.result === null || game.result === 'draw' ? game.result : game.result === player ? 0 : 1,
  };
}
