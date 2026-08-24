export type AmateurDuelSource = 'challenge' | 'matchmaking' | 'tournament';

export interface DuelSettlementPolicy {
  settleStake: boolean;
  grantTemplateRewards: boolean;
  updateRating: boolean;
  evaluateAchievements: boolean;
}

const STANDARD_SETTLEMENT_POLICY: DuelSettlementPolicy = {
  settleStake: true,
  grantTemplateRewards: true,
  updateRating: true,
  evaluateAchievements: true,
};

const TOURNAMENT_SETTLEMENT_POLICY: DuelSettlementPolicy = {
  settleStake: false,
  grantTemplateRewards: false,
  updateRating: false,
  evaluateAchievements: false,
};

export function getDuelSettlementPolicy(source: AmateurDuelSource): DuelSettlementPolicy {
  return source === 'tournament' ? TOURNAMENT_SETTLEMENT_POLICY : STANDARD_SETTLEMENT_POLICY;
}
