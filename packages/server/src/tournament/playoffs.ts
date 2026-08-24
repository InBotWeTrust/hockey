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

export function buildFixedPlayoffBracket(seedParticipantIds: string[]): FixedPlayoffBracket {
  if (![2, 4, 8, 16].includes(seedParticipantIds.length)) {
    throw new Error('playoff size must be 2, 4, 8 or 16');
  }
  if (new Set(seedParticipantIds).size !== seedParticipantIds.length) {
    throw new Error('playoff participants must be unique');
  }
  return {
    firstRound: Array.from({ length: seedParticipantIds.length / 2 }, (_, index) => ({
      bracketPosition: index + 1,
      higherSeedId: seedParticipantIds[index]!,
      lowerSeedId: seedParticipantIds[seedParticipantIds.length - 1 - index]!,
    })),
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
