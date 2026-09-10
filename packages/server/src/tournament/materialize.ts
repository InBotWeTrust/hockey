import {
  assignSequentialRoundWindows,
  generateRoundRobin,
  type TournamentPairing,
} from './schedule.js';

export interface HeadToHeadSchedulePlanRound {
  cycleNumber: number;
  roundNumber: number;
  matchdayNumber: number;
  startsAt: string;
  endsAt: string;
  fixtures: TournamentPairing[];
  byeParticipantId: string | null;
}

export function buildHeadToHeadSchedulePlan(input: {
  participantIds: string[];
  cycles: number;
  roundsPerDay: number;
  firstStart: Date;
  timezone: string;
  firstRoundLocalTime: string;
  fixtureWindowMs: number;
  roundBreakMs: number;
}): HeadToHeadSchedulePlanRound[] {
  const rounds = generateRoundRobin(input.participantIds, input.cycles);
  const windows = assignSequentialRoundWindows({
    roundCount: rounds.length,
    roundsPerDay: input.roundsPerDay,
    firstStart: input.firstStart,
    timezone: input.timezone,
    firstRoundLocalTime: input.firstRoundLocalTime,
    fixtureWindowMs: input.fixtureWindowMs,
    roundBreakMs: input.roundBreakMs,
  });
  return rounds.map((round, index) => ({
    ...round,
    matchdayNumber: windows[index]!.matchdayNumber,
    startsAt: windows[index]!.startsAt,
    endsAt: windows[index]!.endsAt,
  }));
}
