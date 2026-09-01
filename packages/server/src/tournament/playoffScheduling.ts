import { zonedDateTimeToUtc } from './schedule.js';

export interface RoundGameDay {
  localDate: string;
  firstWaveLocalTime: string;
  maxResultGames: number;
}

export interface RebasingRoundGameDay extends RoundGameDay {
  firstGameStartsAt: Date;
}

function localDateParts(localDate: string, localTime: string) {
  const [year, month, day] = localDate.split('-').map(Number);
  const [hour, minute] = localTime.split(':').map(Number);
  return { year: year!, month: month!, day: day!, hour: hour!, minute: minute!, second: 0 };
}

function shiftLocalDate(localDate: string, offsetDays: number): string {
  const shifted = new Date(`${localDate}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Shifts every configured local game day by the same number of calendar days
 * until its first local slot is not in the past. Calendar arithmetic keeps the
 * intended local time intact across daylight-saving transitions.
 */
export function rebaseRoundGameDaysAtOrAfter(
  timezone: string,
  days: RoundGameDay[],
  notBefore: Date,
): RebasingRoundGameDay[] {
  if (Number.isNaN(notBefore.getTime())) throw new Error('notBefore must be a valid date');
  if (days.length === 0) throw new Error('at least one game day is required');

  let offsetDays = 0;
  const firstDay = days[0]!;
  let firstStart = zonedDateTimeToUtc(
    localDateParts(firstDay.localDate, firstDay.firstWaveLocalTime),
    timezone,
  );
  while (firstStart.getTime() < notBefore.getTime()) {
    offsetDays += 1;
    const firstDay = days[0]!;
    const localDate = shiftLocalDate(firstDay.localDate, offsetDays);
    firstStart = zonedDateTimeToUtc(
      localDateParts(localDate, firstDay.firstWaveLocalTime),
      timezone,
    );
  }

  return days.map((day) => {
    const localDate = shiftLocalDate(day.localDate, offsetDays);
    return {
      ...day,
      localDate,
      firstGameStartsAt: zonedDateTimeToUtc(
        localDateParts(localDate, day.firstWaveLocalTime),
        timezone,
      ),
    };
  });
}

export interface RoundGameDayValidationInput {
  winsRequired: number;
  readinessMinutes: number;
  plannedStartIntervalMinutes: number;
  days: RoundGameDay[];
}

/** Tournament ready checks are deliberately capped to two hours. */
export const MAX_TOURNAMENT_READINESS_MINUTES = 120;

/** A planned start cadence may be as short as one minute and no longer than one local day. */
export const MAX_TOURNAMENT_PLANNED_START_INTERVAL_MINUTES = 24 * 60;

function isValidLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function isValidLocalTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  return Number(match[1]) < 24 && Number(match[2]) < 60;
}

function assertPositiveInteger(value: number, message: string): void {
  if (!Number.isInteger(value) || value < 1) throw new Error(message);
}

export function validateRoundGameDays(input: RoundGameDayValidationInput): void {
  assertPositiveInteger(input.winsRequired, 'wins required must be a positive integer');
  if (
    !Number.isInteger(input.readinessMinutes) ||
    input.readinessMinutes < 1 ||
    input.readinessMinutes > MAX_TOURNAMENT_READINESS_MINUTES
  ) {
    throw new Error(`readiness minutes must be between 1 and ${MAX_TOURNAMENT_READINESS_MINUTES}`);
  }
  if (
    !Number.isInteger(input.plannedStartIntervalMinutes) ||
    input.plannedStartIntervalMinutes < 1 ||
    input.plannedStartIntervalMinutes > MAX_TOURNAMENT_PLANNED_START_INTERVAL_MINUTES
  ) {
    throw new Error('planned start interval minutes must be between 1 and 1440');
  }
  if (input.days.length === 0) throw new Error('at least one game day is required');

  let previousDate: string | null = null;
  let scheduledGames = 0;
  for (const day of input.days) {
    if (!isValidLocalDate(day.localDate)) {
      throw new Error('game day localDate must be a valid YYYY-MM-DD date');
    }
    if (!isValidLocalTime(day.firstWaveLocalTime)) {
      throw new Error('game day firstWaveLocalTime must be a valid HH:mm time');
    }
    if (previousDate !== null && day.localDate <= previousDate) {
      throw new Error('game day dates must be strictly increasing');
    }
    assertPositiveInteger(day.maxResultGames, 'game day maxResultGames must be a positive integer');
    previousDate = day.localDate;
    scheduledGames += day.maxResultGames;
  }
  if (scheduledGames !== input.winsRequired * 2 - 1) {
    throw new Error('game day limits must equal the maximum possible series games');
  }
}

export function allocateSeriesGamesByDay(winsRequired: number, dayCount: number): number[] {
  assertPositiveInteger(winsRequired, 'wins required must be a positive integer');
  if (dayCount === 1) return [winsRequired * 2 - 1];
  if (dayCount === 2 && winsRequired === 1) {
    throw new Error('a best-of-one series cannot use the two-day default allocation');
  }
  if (dayCount === 2) return [winsRequired, winsRequired - 1];
  throw new Error('only one or two game days are supported for the default series allocation');
}

export type TournamentDuelFormat = 'express' | 'mix' | 'express_plus' | 'classic';
export type TournamentDuelResult = 'home_win' | 'away_win' | 'replay';

export interface TournamentDuelScore {
  goals: number;
  accuracyPercent: number;
  activeElapsedMs: number;
}

export interface TournamentDuelResultInput {
  format: TournamentDuelFormat;
  home: TournamentDuelScore;
  away: TournamentDuelScore;
}

function roundedAccuracyHundredths(value: number): bigint {
  const [coefficient, exponentPart = '0'] = value.toString().toLowerCase().split('e');
  const exponent = Number(exponentPart);
  const [whole, fraction = ''] = coefficient!.split('.');
  const digits = `${whole}${fraction}`;
  const cutoff = whole!.length + exponent + 2;
  const truncated = cutoff > 0 ? BigInt(digits.slice(0, cutoff).padEnd(cutoff, '0')) : 0n;
  const roundingDigit = cutoff >= 0 ? Number(digits[cutoff] ?? '0') : 0;
  return truncated + BigInt(roundingDigit >= 5 ? 1 : 0);
}

function roundedElapsedSeconds(value: number): number {
  return Math.max(0, Math.round(value / 1000));
}

function assertValidScore(score: TournamentDuelScore, side: 'home' | 'away'): void {
  if (!Number.isFinite(score.goals) || score.goals < 0) {
    throw new Error(`${side} goals must be a finite non-negative number`);
  }
  if (!Number.isInteger(score.goals)) {
    throw new Error(`${side} goals must be a non-negative integer`);
  }
  if (!Number.isFinite(score.accuracyPercent) || score.accuracyPercent < 0) {
    throw new Error(`${side} accuracyPercent must be a finite non-negative number`);
  }
  if (score.accuracyPercent > 100) {
    throw new Error(`${side} accuracyPercent must be a finite number between 0 and 100`);
  }
  if (!Number.isFinite(score.activeElapsedMs) || score.activeElapsedMs < 0) {
    throw new Error(`${side} activeElapsedMs must be a finite non-negative number`);
  }
  if (!Number.isInteger(score.activeElapsedMs)) {
    throw new Error(`${side} activeElapsedMs must be a non-negative integer`);
  }
}

/**
 * Resolves only completed, player-earned tournament scores. Technical outcomes
 * deliberately stay in lifecycle code and cannot be passed to this scorer.
 */
export function resolveTournamentDuelResult(
  input: TournamentDuelResultInput,
): TournamentDuelResult {
  assertValidScore(input.home, 'home');
  assertValidScore(input.away, 'away');
  if (input.home.goals > input.away.goals) return 'home_win';
  if (input.away.goals > input.home.goals) return 'away_win';

  if (input.format === 'express') {
    const homeAccuracy = roundedAccuracyHundredths(input.home.accuracyPercent);
    const awayAccuracy = roundedAccuracyHundredths(input.away.accuracyPercent);
    if (homeAccuracy > awayAccuracy) return 'home_win';
    if (awayAccuracy > homeAccuracy) return 'away_win';
    return 'replay';
  }

  const homeSeconds = roundedElapsedSeconds(input.home.activeElapsedMs);
  const awaySeconds = roundedElapsedSeconds(input.away.activeElapsedMs);
  if (homeSeconds < awaySeconds) return 'home_win';
  if (awaySeconds < homeSeconds) return 'away_win';
  return 'replay';
}

export interface SnapshottedDuelTemplateTiming {
  periodDurationsMs: number[];
  breakDurationsMs: number[];
}

export interface HardGameDeadlineInput {
  plannedStartAt: Date;
  readyCheckDurationMs: number;
  templateTiming: SnapshottedDuelTemplateTiming;
}

/**
 * Computes the immutable game deadline from the game's own snapshot. The
 * schedule's planned-start interval is deliberately not part of this duration.
 */
export function calculateHardGameDeadline(input: HardGameDeadlineInput): Date {
  const plannedStartMs = input.plannedStartAt.getTime();
  if (Number.isNaN(plannedStartMs)) throw new Error('planned start must be a valid date');
  assertPositiveInteger(
    input.readyCheckDurationMs,
    'ready check duration must be a positive integer',
  );

  const { periodDurationsMs, breakDurationsMs } = input.templateTiming;
  if (
    periodDurationsMs.length === 0 ||
    periodDurationsMs.some((duration) => !Number.isInteger(duration) || duration < 1)
  ) {
    throw new Error('template must contain at least one positive period duration');
  }
  if (breakDurationsMs.length !== periodDurationsMs.length - 1) {
    throw new Error('template break durations must cover every interval between periods');
  }
  if (breakDurationsMs.some((duration) => !Number.isInteger(duration) || duration < 0)) {
    throw new Error('template break durations must be non-negative integers');
  }

  const gameDurationMs =
    input.readyCheckDurationMs +
    periodDurationsMs.reduce((total, duration) => total + duration, 0) +
    breakDurationsMs.reduce((total, duration) => total + duration, 0);
  return new Date(plannedStartMs + gameDurationMs);
}
