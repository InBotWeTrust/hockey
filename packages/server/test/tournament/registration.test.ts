import { describe, expect, it } from 'vitest';
import {
  decideTournamentApplication,
  evaluateTournamentEligibility,
} from '../../src/tournament/registration.js';

describe('tournament registration', () => {
  const player = { userId: 'u1', level: 4, goals: 500, experience: 250 };

  it('evaluates allowlist, banlist and progress filters', () => {
    expect(
      evaluateTournamentEligibility(player, {
        minLevel: 3,
        maxLevel: 5,
        minGoals: 400,
        minExperience: 200,
        invitedUserIds: ['u1'],
        bannedUserIds: [],
      }),
    ).toEqual({ eligible: true, reasons: [] });

    expect(
      evaluateTournamentEligibility(player, {
        minLevel: 5,
        maxLevel: null,
        minGoals: 600,
        minExperience: 300,
        invitedUserIds: [],
        bannedUserIds: ['u1'],
      }).reasons,
    ).toEqual(['banned', 'level_too_low', 'goals_too_low', 'experience_too_low']);
  });

  it('requires an invitation for invite-only registration', () => {
    expect(
      decideTournamentApplication({
        mode: 'invite_only',
        invited: false,
        eligible: true,
        approvedParticipants: 2,
        participantLimit: 8,
      }),
    ).toEqual({ accepted: false, state: null, reason: 'invitation_required' });
  });

  it('auto-approves open registration and queues approval mode', () => {
    expect(
      decideTournamentApplication({
        mode: 'open',
        invited: false,
        eligible: true,
        approvedParticipants: 2,
        participantLimit: 8,
      }),
    ).toEqual({ accepted: true, state: 'approved', reason: null });
    expect(
      decideTournamentApplication({
        mode: 'approval',
        invited: false,
        eligible: true,
        approvedParticipants: 2,
        participantLimit: 8,
      }),
    ).toEqual({ accepted: true, state: 'applied', reason: null });
  });

  it('rejects ineligible and full tournaments before charging', () => {
    expect(
      decideTournamentApplication({
        mode: 'open',
        invited: false,
        eligible: false,
        approvedParticipants: 2,
        participantLimit: 8,
      }).reason,
    ).toBe('not_eligible');
    expect(
      decideTournamentApplication({
        mode: 'open',
        invited: false,
        eligible: true,
        approvedParticipants: 8,
        participantLimit: 8,
      }).reason,
    ).toBe('capacity_reached');
  });
});
