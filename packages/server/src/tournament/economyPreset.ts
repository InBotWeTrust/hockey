export interface TournamentEconomyReward {
  place: number;
  coins: number;
  stars: number;
  experience: number;
}

export interface TournamentEconomyPreset {
  participantLimit: number;
  entryFeeCoins: number;
  regularRewards: TournamentEconomyReward[];
  playoffRewards: TournamentEconomyReward[];
  payoutValueCoins: number;
  /** Negative when the game subsidizes prizes beyond the entry-fee fund. */
  sinkValueCoins: number;
}

const ENTRY_FEE_BRACKETS = [
  { through: 7, coins: 2_500 },
  { through: 15, coins: 5_000 },
  { through: 31, coins: 10_000 },
  { through: 63, coins: 12_500 },
] as const;
const FINAL_ENTRY_FEE_COINS = 15_000;

const REGULAR_REWARD_PERCENTAGES = [
  { place: 1, percentage: 7 },
  { place: 2, percentage: 4 },
  { place: 3, percentage: 2 },
] as const;
const PLAYOFF_REWARD_PERCENTAGES = [
  { place: 1, percentage: 38 },
  { place: 2, percentage: 20 },
  { place: 3, percentage: 9 },
  { place: 4, percentage: 5 },
] as const;

function entryFeeForParticipantLimit(participantLimit: number): number {
  return (
    ENTRY_FEE_BRACKETS.find((bracket) => participantLimit <= bracket.through)?.coins ??
    FINAL_ENTRY_FEE_COINS
  );
}

const APPROVED_PODIUM = [
  { coins: 110_000, stars: 600 },
  { coins: 50_000, stars: 300 },
  { coins: 25_000, stars: 150 },
] as const;

function buildRewards(
  fundCoins: number,
  percentages: ReadonlyArray<{ place: number; percentage: number }>,
  stageShare: number,
): TournamentEconomyReward[] {
  return percentages.map(({ place, percentage }) => {
    // Experience retains its existing fund-based calculation independently of stars.
    const experience = Math.floor((fundCoins * percentage) / 10_000);
    const podium = APPROVED_PODIUM[place - 1];
    if (!podium) return { place, coins: 4_000, stars: 80, experience };
    return {
      place,
      coins: podium.coins * stageShare,
      stars: podium.stars * stageShare,
      experience,
    };
  });
}

export function buildTournamentEconomyPreset(participantLimit: number): TournamentEconomyPreset {
  const entryFeeCoins = entryFeeForParticipantLimit(participantLimit);
  const fundCoins = participantLimit * entryFeeCoins;
  const regularRewards = buildRewards(fundCoins, REGULAR_REWARD_PERCENTAGES, 0.2);
  const playoffRewards = buildRewards(fundCoins, PLAYOFF_REWARD_PERCENTAGES, 0.8);
  const payoutValueCoins = [...regularRewards, ...playoffRewards].reduce(
    (total, reward) => total + reward.coins + reward.stars * 50,
    0,
  );

  return {
    participantLimit,
    entryFeeCoins,
    regularRewards,
    playoffRewards,
    payoutValueCoins,
    sinkValueCoins: fundCoins - payoutValueCoins,
  };
}
