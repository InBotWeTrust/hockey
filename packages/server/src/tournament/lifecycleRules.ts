import {
  allocateSeriesGamesByDay,
  validateRoundGameDays,
  type RoundGameDay,
} from './playoffScheduling.js';
import { AUTOMATIC_TOURNAMENT_LIFECYCLE_VERSION } from './automaticLifecycle.js';

export {
  AUTOMATIC_TOURNAMENT_LIFECYCLE_VERSION,
  automaticLifecycleVersion,
} from './automaticLifecycle.js';

export const DEFAULT_TOURNAMENT_READINESS_MINUTES = 5;
export const DEFAULT_TOURNAMENT_PLANNED_START_INTERVAL_MINUTES = 20;

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
        if (!Array.isArray(round.scheduleDays)) return round;

        const winsRequired = explicitNumberOrDefault(round.winsRequired, 4);
        const readinessMinutes = explicitNumberOrDefault(
          round.readinessMinutes,
          DEFAULT_TOURNAMENT_READINESS_MINUTES,
        );
        const plannedStartIntervalMinutes = explicitNumberOrDefault(
          round.plannedStartIntervalMinutes,
          DEFAULT_TOURNAMENT_PLANNED_START_INTERVAL_MINUTES,
        );
        const hasMissingCapacity = round.scheduleDays.some(
          (dayValue) => record(dayValue).maxResultGames === undefined,
        );
        const defaultCapacities = hasMissingCapacity
          ? allocateSeriesGamesByDay(winsRequired, round.scheduleDays.length)
          : undefined;
        const scheduleDays: RoundGameDay[] = round.scheduleDays.map((dayValue, index) => {
          const day = record(dayValue);
          return {
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
          winsRequired,
          readinessMinutes,
          plannedStartIntervalMinutes,
          days: scheduleDays,
        });
        return {
          ...round,
          winsRequired,
          readinessMinutes,
          plannedStartIntervalMinutes,
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
