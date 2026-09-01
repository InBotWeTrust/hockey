import { describe, expect, it } from 'vitest';
import {
  evaluateTournamentLifecycle,
  type TournamentLifecycleSnapshot,
} from '../../src/tournament/automaticLifecycle.js';

const NOW = new Date('2030-01-10T12:00:00.000Z');

function fixtureFor(label: string): TournamentLifecycleSnapshot {
  const base: TournamentLifecycleSnapshot = {
    tournamentId: 'tournament-1',
    status: 'registration',
    revision: 3,
    automaticLifecycleVersion: 1,
    registrationOpensAt: new Date('2030-01-10T11:00:00.000Z'),
    registrationClosesAt: new Date('2030-01-10T13:00:00.000Z'),
    approvedParticipantCount: 4,
    playoffSize: 4,
    scheduleExists: false,
    regularResultsComplete: false,
    playoffStartsAt: new Date('2030-01-10T14:00:00.000Z'),
  };

  switch (label) {
    case 'before registration opens':
      return { ...base, registrationOpensAt: new Date('2030-01-10T12:01:00.000Z') };
    case 'while registration is open':
      return base;
    case 'after registration closes with enough players':
      return { ...base, registrationClosesAt: new Date('2030-01-10T11:59:00.000Z') };
    case 'after registration closes without enough players':
      return {
        ...base,
        registrationClosesAt: new Date('2030-01-10T11:59:00.000Z'),
        approvedParticipantCount: 3,
      };
    case 'with a generated schedule':
      return { ...base, status: 'scheduling', scheduleExists: true };
    case 'when regular results are complete before playoff time':
      return { ...base, status: 'regular', regularResultsComplete: true };
    case 'when regular results are complete after playoff time':
      return {
        ...base,
        status: 'regular',
        regularResultsComplete: true,
        playoffStartsAt: new Date('2030-01-10T11:59:00.000Z'),
      };
    default:
      throw new Error(`Unknown fixture: ${label}`);
  }
}

describe('evaluateTournamentLifecycle', () => {
  it.each([
    ['before registration opens', 'registration_waiting'],
    ['while registration is open', 'registration_open'],
    ['after registration closes with enough players', 'generate_schedule'],
    ['after registration closes without enough players', 'block_registration'],
    ['with a generated schedule', 'await_manual_regular_start'],
    ['when regular results are complete before playoff time', 'await_playoff_time'],
    ['when regular results are complete after playoff time', 'start_playoff'],
  ] as const)('%s returns %s', (label, expected) => {
    expect(evaluateTournamentLifecycle(fixtureFor(label), NOW).action).toBe(expected);
  });

  it('skips a published legacy tournament without the marker', () => {
    expect(
      evaluateTournamentLifecycle(
        {
          ...fixtureFor('after registration closes with enough players'),
          automaticLifecycleVersion: null,
        },
        NOW,
      ),
    ).toMatchObject({
      action: 'legacy_requires_audit',
      reason: 'legacy_requires_audit',
    });
  });

  it('keeps the registration block visible after reconciliation has changed the status', () => {
    expect(
      evaluateTournamentLifecycle(
        {
          ...fixtureFor('after registration closes without enough players'),
          status: 'registration_blocked',
        },
        NOW,
      ),
    ).toMatchObject({
      action: 'block_registration',
      reason: 'not_enough_participants',
    });
  });

  it('uses date instants at the registration boundaries', () => {
    const opensAt = new Date('2030-01-10T12:00:00.000Z');
    const closesAt = new Date('2030-01-10T12:00:00.000Z');

    expect(
      evaluateTournamentLifecycle(
        { ...fixtureFor('while registration is open'), registrationOpensAt: opensAt },
        NOW,
      ).action,
    ).toBe('registration_open');
    expect(
      evaluateTournamentLifecycle(
        { ...fixtureFor('while registration is open'), registrationClosesAt: closesAt },
        NOW,
      ).action,
    ).toBe('generate_schedule');
  });
});
