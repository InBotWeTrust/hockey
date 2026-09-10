export interface TournamentPairing {
  homeParticipantId: string;
  awayParticipantId: string;
  venueMode: 'home_selected' | 'neutral_default';
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

interface ZonedDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(date: Date, timezone: string): ZonedDateTimeParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

function localPartsAsUtc(parts: ZonedDateTimeParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

export function zonedDateTimeToUtc(parts: ZonedDateTimeParts, timezone: string): Date {
  const desired = localPartsAsUtc(parts);
  let candidate = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = localPartsAsUtc(zonedParts(new Date(candidate), timezone));
    const correction = desired - observed;
    candidate += correction;
    if (correction === 0) break;
  }
  const resolved = new Date(candidate);
  const actual = zonedParts(resolved, timezone);
  if (localPartsAsUtc(actual) !== desired) {
    throw new Error(`local time does not exist in timezone ${timezone}`);
  }
  return resolved;
}

function addLocalCalendarDays(parts: ZonedDateTimeParts, days: number): ZonedDateTimeParts {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    ...parts,
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function addZonedCalendarDays(date: Date, timezone: string, days: number): Date {
  return zonedDateTimeToUtc(addLocalCalendarDays(zonedParts(date, timezone), days), timezone);
}

function generateSingleCycle(
  participantIds: string[],
): Omit<TournamentRoundSchedule, 'cycleNumber'>[] {
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
        venueMode: 'neutral_default',
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
    const venueMode =
      cycleCount % 2 === 1 && cycleIndex === cycleCount - 1
        ? 'neutral_default'
        : 'home_selected';
    for (const baseRound of base) {
      rounds.push({
        cycleNumber: cycleIndex + 1,
        roundNumber: rounds.length + 1,
        fixtures: baseRound.fixtures.map((fixture) =>
          reverseHomes
            ? {
                homeParticipantId: fixture.awayParticipantId,
                awayParticipantId: fixture.homeParticipantId,
                venueMode,
              }
            : { ...fixture, venueMode },
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
  timezone?: string;
  firstRoundLocalTime?: string;
  fixtureWindowMs: number;
  roundBreakMs: number;
}): SequentialRoundWindow[] {
  const occupiedMs =
    input.roundsPerDay * input.fixtureWindowMs +
    Math.max(0, input.roundsPerDay - 1) * input.roundBreakMs;
  if (occupiedMs > 86_400_000) throw new Error('round windows must fit inside one day');

  const timezone = input.timezone ?? 'UTC';
  const firstLocal = zonedParts(input.firstStart, timezone);
  const localTime =
    input.firstRoundLocalTime ??
    `${String(firstLocal.hour).padStart(2, '0')}:${String(firstLocal.minute).padStart(2, '0')}`;
  const parsedTime = /^(\d{2}):(\d{2})$/.exec(localTime);
  if (!parsedTime) throw new Error('first round local time is invalid');
  const firstMatchday = {
    ...firstLocal,
    hour: Number(parsedTime[1]),
    minute: Number(parsedTime[2]),
    second: 0,
  };

  return Array.from({ length: input.roundCount }, (_, index) => {
    const matchdayIndex = Math.floor(index / input.roundsPerDay);
    const slotIndex = index % input.roundsPerDay;
    const matchdayStart = zonedDateTimeToUtc(
      addLocalCalendarDays(firstMatchday, matchdayIndex),
      timezone,
    );
    const startsAt = new Date(
      matchdayStart.getTime() + slotIndex * (input.fixtureWindowMs + input.roundBreakMs),
    );
    return {
      roundNumber: index + 1,
      matchdayNumber: matchdayIndex + 1,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + input.fixtureWindowMs).toISOString(),
    };
  });
}
