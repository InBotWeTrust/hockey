import {
  allocateSeriesGamesByDay,
  parsePairStartTimes,
  resolvePairDayStart,
  validateRoundGameDays,
  validateRoundGameTiming,
  type RoundGameDay,
} from './playoffScheduling.js';
import { AUTOMATIC_TOURNAMENT_LIFECYCLE_VERSION } from './automaticLifecycle.js';
import { buildPlayoffSeriesPlan } from './playoffs.js';

export {
  AUTOMATIC_TOURNAMENT_LIFECYCLE_VERSION,
  automaticLifecycleVersion,
} from './automaticLifecycle.js';

export const DEFAULT_TOURNAMENT_READINESS_MINUTES = 5;
export const DEFAULT_TOURNAMENT_GAME_DURATION_MINUTES = 20;
export const DEFAULT_TOURNAMENT_INTER_GAME_BREAK_MINUTES = 5;

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function explicitNumberOrDefault(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  return typeof value === 'number' ? value : Number.NaN;
}

export function normalizePublishedTournamentLifecycleRules<T extends UnknownRecord>(
  input: T,
  options: { markNewHeadToHead?: boolean; markNewAutomaticLifecycle?: boolean } = {},
): T & UnknownRecord {
  const config = record(input.config);
  const shouldMarkHeadToHead =
    options.markNewHeadToHead !== false && config.regularSource === 'head_to_head';
  const rulesWithoutLifecycleMarker = { ...input };
  delete rulesWithoutLifecycleMarker.automaticLifecycleVersion;
  const shouldMarkAutomaticLifecycle = options.markNewAutomaticLifecycle === true;
  const playoffRounds = Array.isArray(input.playoffRounds)
    ? input.playoffRounds.map((value) => {
        const round = record(value);
        const roundWithoutLegacyCadence = { ...round };
        delete roundWithoutLegacyCadence.plannedStartIntervalMinutes;
        const winsRequired = explicitNumberOrDefault(round.winsRequired, 4);
        const readinessMinutes = explicitNumberOrDefault(
          round.readinessMinutes,
          DEFAULT_TOURNAMENT_READINESS_MINUTES,
        );
        const gameDurationMinutes = explicitNumberOrDefault(
          round.gameDurationMinutes,
          DEFAULT_TOURNAMENT_GAME_DURATION_MINUTES,
        );
        const interGameBreakMinutes = explicitNumberOrDefault(
          round.interGameBreakMinutes,
          DEFAULT_TOURNAMENT_INTER_GAME_BREAK_MINUTES,
        );
        const plannedStartIntervalMinutes = explicitNumberOrDefault(
          round.plannedStartIntervalMinutes,
          Number.NaN,
        );
        validateRoundGameTiming({
          winsRequired,
          readinessMinutes,
          gameDurationMinutes,
          interGameBreakMinutes,
          ...(Number.isNaN(plannedStartIntervalMinutes) ? {} : { plannedStartIntervalMinutes }),
        });
        if (!Array.isArray(round.scheduleDays)) {
          return {
            ...roundWithoutLegacyCadence,
            winsRequired,
            readinessMinutes,
            gameDurationMinutes,
            interGameBreakMinutes,
          };
        }
        const hasMissingCapacity = round.scheduleDays.some(
          (dayValue) => record(dayValue).maxResultGames === undefined,
        );
        const defaultCapacities = hasMissingCapacity
          ? allocateSeriesGamesByDay(winsRequired, round.scheduleDays.length)
          : undefined;
        const scheduleDays: RoundGameDay[] = round.scheduleDays.map((dayValue, index) => {
          const day = record(dayValue);
          const pairStartTimes = parsePairStartTimes(day.pairStartTimes);
          if (pairStartTimes !== undefined) {
            const size = typeof config.playoffSize === 'number' ? config.playoffSize : 2;
            const allowed = new Set(
              buildPlayoffSeriesPlan(Array.from({ length: size }, (_, i) => String(i)))
                .filter((slot) => slot.roundNumber === round.roundNumber)
                .map((slot) => slot.key),
            );
            if (Object.keys(pairStartTimes).some((key) => !allowed.has(key)))
              throw new Error('pair start slot does not belong to this playoff round');
            for (const key of Object.keys(pairStartTimes)) {
              resolvePairDayStart(
                {
                  localDate: typeof day.localDate === 'string' ? day.localDate : '',
                  firstWaveLocalTime:
                    typeof day.firstWaveLocalTime === 'string' ? day.firstWaveLocalTime : '',
                  maxResultGames: 1,
                  pairStartTimes,
                },
                key,
                typeof config.timezone === 'string' ? config.timezone : 'Europe/Moscow',
              );
            }
          }
          return {
            ...(pairStartTimes === undefined ? {} : { pairStartTimes }),
            localDate: typeof day.localDate === 'string' ? day.localDate : '',
            firstWaveLocalTime:
              typeof day.firstWaveLocalTime === 'string' ? day.firstWaveLocalTime : '',
            maxResultGames: explicitNumberOrDefault(
              day.maxResultGames,
              defaultCapacities?.[index] ?? 0,
            ),
          };
        });
        validateRoundGameDays({
          timezone: typeof config.timezone === 'string' ? config.timezone : 'Europe/Moscow',
          winsRequired,
          readinessMinutes,
          gameDurationMinutes,
          interGameBreakMinutes,
          ...(Number.isNaN(plannedStartIntervalMinutes) ? {} : { plannedStartIntervalMinutes }),
          days: scheduleDays,
        });
        return {
          ...roundWithoutLegacyCadence,
          winsRequired,
          readinessMinutes,
          gameDurationMinutes,
          interGameBreakMinutes,
          scheduleDays,
        };
      })
    : input.playoffRounds;

  return {
    ...rulesWithoutLifecycleMarker,
    ...(playoffRounds !== undefined ? { playoffRounds } : {}),
    ...(shouldMarkAutomaticLifecycle
      ? { automaticLifecycleVersion: AUTOMATIC_TOURNAMENT_LIFECYCLE_VERSION }
      : {}),
    ...(shouldMarkHeadToHead ? { duelLifecycleVersion: 2 } : {}),
  } as T & UnknownRecord;
}
