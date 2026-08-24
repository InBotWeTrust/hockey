export interface TournamentPairing {
  homeParticipantId: string;
  awayParticipantId: string;
}

export interface TournamentRoundSchedule {
  cycleNumber: number;
  roundNumber: number;
  fixtures: TournamentPairing[];
  byeParticipantId: string | null;
}

export interface SequentialRoundWindow {
  roundNumber: number;
  matchdayNumber: number;
  startsAt: string;
  endsAt: string;
}

function generateSingleCycle(participantIds: string[]): Omit<TournamentRoundSchedule, 'cycleNumber'>[] {
  if (participantIds.length < 2) throw new Error('at least two participants are required');
  if (new Set(participantIds).size !== participantIds.length) {
    throw new Error('participant ids must be unique');
  }

  const rotation: Array<string | null> = [...participantIds];
  if (rotation.length % 2 === 1) rotation.push(null);
  const roundCount = rotation.length - 1;
  const rounds: Omit<TournamentRoundSchedule, 'cycleNumber'>[] = [];

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
    const fixtures: TournamentPairing[] = [];
    let byeParticipantId: string | null = null;

    for (let pairIndex = 0; pairIndex < rotation.length / 2; pairIndex += 1) {
      const first = rotation[pairIndex]!;
      const second = rotation[rotation.length - 1 - pairIndex]!;
      if (first === null || second === null) {
        byeParticipantId = first ?? second;
        continue;
      }
      const firstIsHome = (roundIndex + pairIndex) % 2 === 0;
      fixtures.push({
        homeParticipantId: firstIsHome ? first : second,
        awayParticipantId: firstIsHome ? second : first,
      });
    }

    rounds.push({ roundNumber: roundIndex + 1, fixtures, byeParticipantId });
    const tail = rotation.pop()!;
    rotation.splice(1, 0, tail);
  }
  return rounds;
}

export function generateRoundRobin(
  participantIds: string[],
  cycleCount: number,
): TournamentRoundSchedule[] {
  if (!Number.isInteger(cycleCount) || cycleCount < 1) {
    throw new Error('cycle count must be a positive integer');
  }
  const base = generateSingleCycle(participantIds);
  const rounds: TournamentRoundSchedule[] = [];
  for (let cycleIndex = 0; cycleIndex < cycleCount; cycleIndex += 1) {
    const reverseHomes = cycleIndex % 2 === 1;
    for (const baseRound of base) {
      rounds.push({
        cycleNumber: cycleIndex + 1,
        roundNumber: rounds.length + 1,
        fixtures: baseRound.fixtures.map((fixture) =>
          reverseHomes
            ? {
                homeParticipantId: fixture.awayParticipantId,
                awayParticipantId: fixture.homeParticipantId,
              }
            : { ...fixture },
        ),
        byeParticipantId: baseRound.byeParticipantId,
      });
    }
  }
  return rounds;
}

export function assignSequentialRoundWindows(input: {
  roundCount: number;
  roundsPerDay: number;
  firstStart: Date;
  fixtureWindowMs: number;
  roundBreakMs: number;
}): SequentialRoundWindow[] {
  const occupiedMs =
    input.roundsPerDay * input.fixtureWindowMs +
    Math.max(0, input.roundsPerDay - 1) * input.roundBreakMs;
  if (occupiedMs > 86_400_000) throw new Error('round windows must fit inside one day');

  return Array.from({ length: input.roundCount }, (_, index) => {
    const matchdayIndex = Math.floor(index / input.roundsPerDay);
    const slotIndex = index % input.roundsPerDay;
    const startsAt = new Date(
      input.firstStart.getTime() +
        matchdayIndex * 86_400_000 +
        slotIndex * (input.fixtureWindowMs + input.roundBreakMs),
    );
    return {
      roundNumber: index + 1,
      matchdayNumber: matchdayIndex + 1,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + input.fixtureWindowMs).toISOString(),
    };
  });
}

