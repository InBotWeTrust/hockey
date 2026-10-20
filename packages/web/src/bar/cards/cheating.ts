import type { Game } from './rules.js';

// Only local Grigory games may stage an illegal throw. Online rules stay authoritative.
export function attemptCheat(g: Game): Game | null {
  if (
    g.result !== null ||
    g.attacker !== 1 ||
    g.phase !== 'attack' ||
    !g.table.length ||
    g.table.length >= g.limit ||
    !g.table.every((p) => p.defence)
  )
    return null;
  const ranks = g.table.flatMap((p) => [p.attack.rank, ...(p.defence ? [p.defence.rank] : [])]);
  const card = g.hands[1].find((c) => !ranks.includes(c.rank));
  if (!card) return null;
  return {
    ...g,
    hands: [[...g.hands[0]], g.hands[1].filter((c) => c.id !== card.id)],
    table: [...g.table, { attack: card }],
    phase: 'defend',
    revision: g.revision + 1,
  };
}
export function catchCheat(before: Game, staged: Game): Game {
  return { ...before, revision: staged.revision + 1 };
}
