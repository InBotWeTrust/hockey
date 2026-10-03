/** Matches the fixed seeded bracket used by tournament/playoffs on the server. */
export function playoffSeriesLabel(size: number, round: number, position: number): string {
  if (round > 1) {
    return `Серия ${position} (победители серий ${position * 2 - 1} и ${position * 2})`;
  }
  let seeds = [1, 2];
  for (let bracketSize = 4; bracketSize <= size; bracketSize *= 2) {
    seeds = seeds.flatMap((seed) => [seed, bracketSize + 1 - seed]);
  }
  const higher = seeds[(position - 1) * 2];
  const lower = seeds[(position - 1) * 2 + 1];
  return higher === undefined || lower === undefined
    ? `Серия ${position}`
    : `Серия ${position} (${higher}–${lower})`;
}

export function playoffSlotLabel(size: number, key: string): string {
  if (key === 'BRONZE') return 'За третье место (проигравшие полуфиналов)';
  const match = /^R(\d+)S(\d+)$/.exec(key);
  return match ? playoffSeriesLabel(size, Number(match[1]), Number(match[2])) : 'Серия';
}
