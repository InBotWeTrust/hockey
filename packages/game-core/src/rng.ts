import seedrandom from 'seedrandom';

export interface Rng {
  next(): number;
  range(min: number, max: number): number;
}

export function createRng(seed: string): Rng {
  const gen = seedrandom(seed);
  return {
    next: () => gen(),
    range: (min, max) => min + Math.floor(gen() * (max - min)),
  };
}
