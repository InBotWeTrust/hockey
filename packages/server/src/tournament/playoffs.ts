export type HomeDesignation = 'H' | 'A';

export interface PlayoffPairing {
  bracketPosition: number;
  higherSeedId: string;
  lowerSeedId: string;
}

export interface FixedPlayoffBracket {
  firstRound: PlayoffPairing[];
  thirdPlaceRequired: boolean;
}

function standardSeedOrder(size: number): number[] {
  let order = [1, 2];
  for (let bracketSize = 4; bracketSize <= size; bracketSize *= 2) {
    order = order.flatMap((seed) => [seed, bracketSize + 1 - seed]);
  }
  return order;
}

export function buildFixedPlayoffBracket(seedParticipantIds: string[]): FixedPlayoffBracket {
  if (![2, 4, 8, 16].includes(seedParticipantIds.length)) {
    throw new Error('playoff size must be 2, 4, 8 or 16');
  }
  if (new Set(seedParticipantIds).size !== seedParticipantIds.length) {
    throw new Error('playoff participants must be unique');
  }
  const seedOrder = standardSeedOrder(seedParticipantIds.length);
  return {
    firstRound: Array.from({ length: seedParticipantIds.length / 2 }, (_, index) => {
      const higherSeed = seedOrder[index * 2]!;
      const lowerSeed = seedOrder[index * 2 + 1]!;
      return {
        bracketPosition: index + 1,
        higherSeedId: seedParticipantIds[higherSeed - 1]!,
        lowerSeedId: seedParticipantIds[lowerSeed - 1]!,
      };
    }),
    thirdPlaceRequired: seedParticipantIds.length >= 4,
  };
}

export interface SeriesScheduleGame {
  gameNumber: number;
  higherSeedIsHome: boolean;
  conditional: boolean;
}

export function expandSeriesSchedule(
  winsRequired: number,
  homeSequence: HomeDesignation[],
): SeriesScheduleGame[] {
  const maximumGames = winsRequired * 2 - 1;
  if (!Number.isInteger(winsRequired) || winsRequired < 1) {
    throw new Error('wins required must be a positive integer');
  }
  if (homeSequence.length !== maximumGames) {
    throw new Error('home sequence must describe every possible game');
  }
  return homeSequence.map((designation, index) => ({
    gameNumber: index + 1,
    higherSeedIsHome: designation === 'H',
    conditional: index + 1 > winsRequired,
  }));
}

export function buildPlayoffFixtureWindows(input: {
  gameCount: number;
  firstStart: Date;
  gameWindowMs: number;
  gameBreakMs: number;
}): Array<{ gameNumber: number; startsAt: string; endsAt: string }> {
  return Array.from({ length: input.gameCount }, (_, index) => {
    const startsAt = new Date(
      input.firstStart.getTime() + index * (input.gameWindowMs + input.gameBreakMs),
    );
    return {
      gameNumber: index + 1,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + input.gameWindowMs).toISOString(),
    };
  });
}

export type PlayoffParticipantSource =
  | { type: 'seed'; participantId: string }
  | { type: 'winner' | 'loser'; seriesKey: string };

export interface PlayoffSeriesPlanItem {
  key: string;
  roundNumber: number;
  position: number;
  kind: 'championship' | 'third_place';
  higherSource: PlayoffParticipantSource;
  lowerSource: PlayoffParticipantSource;
}

export function buildPlayoffSeriesPlan(seedParticipantIds: string[]): PlayoffSeriesPlanItem[] {
  const first = buildFixedPlayoffBracket(seedParticipantIds).firstRound;
  const plan: PlayoffSeriesPlanItem[] = first.map((pairing) => ({
    key: `R1S${pairing.bracketPosition}`,
    roundNumber: 1,
    position: pairing.bracketPosition,
    kind: 'championship',
    higherSource: { type: 'seed', participantId: pairing.higherSeedId },
    lowerSource: { type: 'seed', participantId: pairing.lowerSeedId },
  }));
  let previousRound = plan.map((item) => item.key);
  let roundNumber = 2;
  while (previousRound.length > 1) {
    const nextRound: string[] = [];
    for (let index = 0; index < previousRound.length; index += 2) {
      const key = `R${roundNumber}S${index / 2 + 1}`;
      plan.push({
        key,
        roundNumber,
        position: index / 2 + 1,
        kind: 'championship',
        higherSource: { type: 'winner', seriesKey: previousRound[index]! },
        lowerSource: { type: 'winner', seriesKey: previousRound[index + 1]! },
      });
      nextRound.push(key);
    }
    previousRound = nextRound;
    roundNumber += 1;
  }
  if (seedParticipantIds.length >= 4) {
    const semifinalsRound = Math.log2(seedParticipantIds.length) - 1;
    const semifinals = plan.filter(
      (item) => item.roundNumber === semifinalsRound && item.kind === 'championship',
    );
    plan.push({
      key: 'BRONZE',
      roundNumber: roundNumber - 1,
      position: 1,
      kind: 'third_place',
      higherSource: { type: 'loser', seriesKey: semifinals[0]!.key },
      lowerSource: { type: 'loser', seriesKey: semifinals[1]!.key },
    });
  }
  return plan;
}
