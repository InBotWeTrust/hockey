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

  it('builds the approved 16-player reward table without exceeding the payout cap', () => {
    expect(buildTournamentEconomyPreset(16)).toEqual({
      participantLimit: 16,
      entryFeeCoins: 10_000,
      regularRewards: [
        { place: 1, coins: 5_600, stars: 112, experience: 112 },
        { place: 2, coins: 3_200, stars: 64, experience: 64 },
        { place: 3, coins: 1_600, stars: 32, experience: 32 },
      ],
      playoffRewards: [
        { place: 1, coins: 30_400, stars: 608, experience: 608 },
        { place: 2, coins: 16_000, stars: 320, experience: 320 },
        { place: 3, coins: 7_200, stars: 144, experience: 144 },
        { place: 4, coins: 4_000, stars: 80, experience: 80 },
      ],
      payoutValueCoins: 136_000,
      sinkValueCoins: 24_000,
    });
  });
});
