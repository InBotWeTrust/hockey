import { describe, expect, it } from 'vitest';
import { buildTournamentEconomyPreset } from '../../src/tournament/economyPreset.js';

describe('buildTournamentEconomyPreset', () => {
  it.each([
    [7, 2_500],
    [8, 5_000],
    [15, 5_000],
    [16, 10_000],
    [31, 10_000],
    [32, 12_500],
    [63, 12_500],
    [64, 15_000],
  ])('uses a %i-player entry fee of %i coins', (participantLimit, entryFeeCoins) => {
    expect(buildTournamentEconomyPreset(participantLimit).entryFeeCoins).toBe(entryFeeCoins);
  });

  it('builds the approved 16-player reward table with the approved fixed podium and explicit funding deficit', () => {
    expect(buildTournamentEconomyPreset(16)).toEqual({
      participantLimit: 16,
      entryFeeCoins: 10_000,
      regularRewards: [
        { place: 1, coins: 22_000, stars: 120, experience: 112 },
        { place: 2, coins: 10_000, stars: 60, experience: 64 },
        { place: 3, coins: 5_000, stars: 30, experience: 32 },
      ],
      playoffRewards: [
        { place: 1, coins: 88_000, stars: 480, experience: 608 },
        { place: 2, coins: 40_000, stars: 240, experience: 320 },
        { place: 3, coins: 20_000, stars: 120, experience: 144 },
        { place: 4, coins: 4_000, stars: 80, experience: 80 },
      ],
      payoutValueCoins: 245_500,
      sinkValueCoins: -85_500,
    });
  });
});

it.each([2, 8, 32, 64])('keeps the agreed monetary podium for %i participants', (count) => {
  const preset = buildTournamentEconomyPreset(count);
  for (const [index, coins, stars] of [[0,110000,600],[1,50000,300],[2,25000,150]]) {
    expect(preset.regularRewards[index]!.coins + preset.playoffRewards[index]!.coins).toBe(coins);
    expect(preset.regularRewards[index]!.stars + preset.playoffRewards[index]!.stars).toBe(stars);
  }
  expect(preset.playoffRewards[3]).toMatchObject({ coins: 4000, stars: 80 });
});
