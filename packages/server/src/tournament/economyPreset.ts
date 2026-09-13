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

function buildRewards(
  fundCoins: number,
  percentages: ReadonlyArray<{ place: number; percentage: number }>,
): TournamentEconomyReward[] {
  return percentages.map(({ place, percentage }) => {
    const placeValueCoins = (fundCoins * percentage) / 100;
    const coins = Math.floor(placeValueCoins / 2);
    const stars = Math.floor(placeValueCoins / 100);
    return { place, coins, stars, experience: stars };
  });
}

export function buildTournamentEconomyPreset(participantLimit: number): TournamentEconomyPreset {
  const entryFeeCoins = entryFeeForParticipantLimit(participantLimit);
  const fundCoins = participantLimit * entryFeeCoins;
  const regularRewards = buildRewards(fundCoins, REGULAR_REWARD_PERCENTAGES);
  const playoffRewards = buildRewards(fundCoins, PLAYOFF_REWARD_PERCENTAGES);
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
