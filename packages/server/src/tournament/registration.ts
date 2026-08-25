import type { TournamentRegistrationMode } from './types.js';

export interface TournamentEligibilityPlayer {
  userId: string;
  level: number;
  goals: number;
  experience: number;
}

export interface TournamentEligibilityRules {
  minLevel: number | null;
  maxLevel: number | null;
  minGoals: number;
  minExperience: number;
  invitedUserIds: string[];
  bannedUserIds: string[];
}

export type TournamentEligibilityReason =
  | 'banned'
  | 'not_invited'
  | 'level_too_low'
  | 'level_too_high'
  | 'goals_too_low'
  | 'experience_too_low';

export function evaluateTournamentEligibility(
  player: TournamentEligibilityPlayer,
  rules: TournamentEligibilityRules,
): { eligible: boolean; reasons: TournamentEligibilityReason[] } {
  const reasons: TournamentEligibilityReason[] = [];
  if (rules.bannedUserIds.includes(player.userId)) reasons.push('banned');
  if (rules.minLevel !== null && player.level < rules.minLevel) reasons.push('level_too_low');
  if (rules.maxLevel !== null && player.level > rules.maxLevel) reasons.push('level_too_high');
  if (player.goals < rules.minGoals) reasons.push('goals_too_low');
  if (player.experience < rules.minExperience) reasons.push('experience_too_low');
  return { eligible: reasons.length === 0, reasons };
}

export interface TournamentApplicationDecisionInput {
  mode: TournamentRegistrationMode;
  invited: boolean;
  eligible: boolean;
  approvedParticipants: number;
  participantLimit: number;
}

export type TournamentApplicationDecision =
  | { accepted: true; state: 'approved' | 'applied'; reason: null }
  | {
      accepted: false;
      state: null;
      reason: 'invitation_required' | 'not_eligible' | 'capacity_reached';
    };

export function decideTournamentApplication(
  input: TournamentApplicationDecisionInput,
): TournamentApplicationDecision {
  if (input.mode === 'invite_only' && !input.invited) {
    return { accepted: false, state: null, reason: 'invitation_required' };
  }
  if (!input.eligible) return { accepted: false, state: null, reason: 'not_eligible' };
  if (input.approvedParticipants >= input.participantLimit) {
    return { accepted: false, state: null, reason: 'capacity_reached' };
  }
  return {
    accepted: true,
    state: input.mode === 'approval' ? 'applied' : 'approved',
    reason: null,
  };
}
