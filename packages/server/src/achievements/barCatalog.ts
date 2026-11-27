import definitions from './barCatalog.json' with { type: 'json' };
export const BAR_DEFINITIONS = definitions;
export const BAR_IDS = new Set(definitions.map((x) => x.id));
export const BAR_CUMULATIVE_NUMBERS = new Set([
  1, 6, 13, 20, 26, 30, 36, 2, 7, 14, 21, 27, 31, 37, 44,
]);
export const BAR_GAME_CHAINS: Record<string, [number, number, number]> = {
  darts: [1, 2, 5],
  billiards: [6, 7, 12],
  checkers: [13, 14, 19],
  ochko: [20, 21, 25],
  armwrestling: [26, 27, 29],
  battleship: [30, 31, 35],
  durak: [36, 37, 43],
};
export function barStageTarget(number: number, target: number, level: number): number {
  return BAR_CUMULATIVE_NUMBERS.has(number) ? target : level;
}
export interface BarResultState {
  wins: number;
  streak: number;
  bestStreak: number;
  lastOpponent: string;
  lastWon: boolean | null;
  rematch: boolean;
}
export function advanceBarResult(
  previous: BarResultState | undefined,
  opponent: string,
  won: boolean,
  eligible = true,
): BarResultState {
  const streak = eligible && won ? (previous?.streak ?? 0) + 1 : 0;
  return {
    wins: (previous?.wins ?? 0) + (eligible && won ? 1 : 0),
    streak,
    bestStreak: Math.max(previous?.bestStreak ?? 0, streak),
    lastOpponent: opponent,
    lastWon: eligible ? won : null,
    rematch: eligible && won && previous?.lastWon === false && previous.lastOpponent === opponent,
  };
}
