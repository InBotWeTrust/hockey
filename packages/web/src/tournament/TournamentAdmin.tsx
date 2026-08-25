import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { GlassSelect } from '../components/GlassSelect.js';
import {
  createAdminTournament,
  fetchAdminTournamentDuelTemplates,
  fetchAdminTournamentUsers,
  fetchAdminTournaments,
  updateAdminTournament,
  type AdminTournament,
  type AdminTournamentUserOption,
} from './adminApi.js';
import { TournamentOperations } from './TournamentOperations.js';
import { TournamentAdminField, TournamentAdminGroupHelp } from './TournamentAdminField.js';
import {
  TournamentDraftSaveQueue,
  type TournamentDraftSaveStatus,
} from './tournamentDraftSaveQueue.js';

const stages = [
  'Основное',
  'Доступ',
  'Регулярка',
  'Плей-офф',
  'Расписание',
  'Награды',
  'Уведомления',
  'Проверка',
] as const;

type RegularSource = 'head_to_head' | 'daily_aggregate';
type RegistrationMode = 'open' | 'approval' | 'invite_only';
type Visibility = 'public' | 'hidden';
type DailyMetric = 'goals_sum' | 'accuracy_average' | 'daily_place_points';
type PlayoffSize = 2 | 4 | 8 | 16;

interface PlayoffRoundDraft {
  winsRequired: number;
  duelTemplateId: string;
  homeSequence: string;
  gameWindowMinutes: number;
  gameBreakMinutes: number;
  roundBreakMinutes: number;
  overtimeCount: number;
  shootoutInitialShots: number;
}

interface TournamentDraftOrigin {
  timezone: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  startsAt: string | null;
}

interface TournamentDraft {
  slug: string;
  title: string;
  description: string;
  regularSource: RegularSource;
  registrationMode: RegistrationMode;
  visibility: Visibility;
  participantLimit: number;
  playoffSize: PlayoffSize;
  entryFeeCoins: number;
  minLevel: string;
  maxLevel: string;
  minGoals: number;
  minExperience: number;
  invitedUserIds: string;
  bannedUserIds: string;
  timezone: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  startsAt: string;
  roundRobinCycles: number;
  roundsPerDay: number;
  firstRoundLocalTime: string;
  fixtureWindowMinutes: number;
  roundBreakMinutes: number;
  dailyDays: number;
  dailyMetric: DailyMetric;
  bestDays: string;
  regularDuelTemplateId: string;
  regulationWin: number;
  overtimeWin: number;
  overtimeLoss: number;
  draw: number;
  loss: number;
  technicalLoss: number;
  tieBreakCriteria: string;
  dailyPlacePoints: string;
  playoffRounds: PlayoffRoundDraft[];
  regularRewards: string;
  playoffRewards: string;
  reminderMinutes: string;
  deadlineLeadMinutes: number;
  notificationOverrides: string;
  origin?: TournamentDraftOrigin;
}

const defaultPlayoffRound = (): PlayoffRoundDraft => ({
  winsRequired: 4,
  duelTemplateId: '',
  homeSequence: 'H-H-A-A-H-A-H',
  gameWindowMinutes: 60,
  gameBreakMinutes: 15,
  roundBreakMinutes: 1_440,
  overtimeCount: 1,
  shootoutInitialShots: 3,
});

const defaultDraft: TournamentDraft = {
  slug: '',
  title: '',
  description: '',
  regularSource: 'head_to_head',
  registrationMode: 'open',
  visibility: 'public',
  participantLimit: 16,
  playoffSize: 8,
  entryFeeCoins: 0,
  minLevel: '',
  maxLevel: '',
  minGoals: 0,
  minExperience: 0,
  invitedUserIds: '',
  bannedUserIds: '',
  timezone: 'Europe/Moscow',
  registrationOpensAt: '',
  registrationClosesAt: '',
  startsAt: '',
  roundRobinCycles: 1,
  roundsPerDay: 1,
  firstRoundLocalTime: '19:00',
  fixtureWindowMinutes: 60,
  roundBreakMinutes: 15,
  dailyDays: 14,
  dailyMetric: 'goals_sum',
  bestDays: '',
  regularDuelTemplateId: '',
  regulationWin: 3,
  overtimeWin: 2,
  overtimeLoss: 1,
  draw: 1,
  loss: 0,
  technicalLoss: 0,
  tieBreakCriteria: 'points,wins,goal_difference,goals_for',
  dailyPlacePoints: '',
  playoffRounds: Array.from({ length: 4 }, defaultPlayoffRound),
  regularRewards: '',
  playoffRewards: '',
  reminderMinutes: '60,15',
  deadlineLeadMinutes: 30,
  notificationOverrides: '',
};

function splitList(value: string, separator = ','): string[] {
  return value
    .split(separator)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function optionalNumber(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

type WallClockParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function timeZoneParts(date: Date, timezone: string): WallClockParts {
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

function wallClockAsUtc(parts: WallClockParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function wallClockToIso(value: string, timezone: string): string {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!parsed) throw new Error('Некорректные локальные дата и время');
  const desiredParts: WallClockParts = {
    year: Number(parsed[1]),
    month: Number(parsed[2]),
    day: Number(parsed[3]),
    hour: Number(parsed[4]),
    minute: Number(parsed[5]),
    second: 0,
  };
  const desired = wallClockAsUtc(desiredParts);
  let candidate = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = wallClockAsUtc(timeZoneParts(new Date(candidate), timezone));
    const correction = desired - observed;
    candidate += correction;
    if (correction === 0) break;
  }
  const resolved = new Date(candidate);
  if (wallClockAsUtc(timeZoneParts(resolved, timezone)) !== desired) {
    throw new Error(`Такого локального времени нет в часовом поясе ${timezone}`);
  }
  return resolved.toISOString();
}

function dateOrNull(
  value: string,
  timezone: string,
  original?: { iso: string | null; timezone: string },
): string | null {
  if (value === '') return null;
  if (
    original?.iso &&
    original.timezone === timezone &&
    localDateTimeValue(original.iso, timezone) === value
  ) {
    return original.iso;
  }
  return wallClockToIso(value, timezone);
}

type RewardDraftRow = Record<'place' | 'experience' | 'coins' | 'stars', string>;

function rewardDraftRows(value: string): RewardDraftRow[] {
  return value
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [place = '', experience = '', coins = '', stars = ''] = line
        .split(',')
        .map((part) => part.trim());
      return { place, experience, coins, stars };
    });
}

function serializeRewardRows(rows: RewardDraftRow[]): string {
  return rows.map((row) => [row.place, row.experience, row.coins, row.stars].join(',')).join('\n');
}

function rewardValidationError(value: string, label = ''): string | null {
  const suffix = label ? ` ${label}` : '';
  for (const row of rewardDraftRows(value)) {
    if (row.place.trim() === '') return `Заполните место награды${suffix}.`;
    if ([row.experience, row.coins, row.stars].some((item) => item.trim() === '')) {
      return `Заполните все значения награды${suffix}.`;
    }
    const numbers = [row.place, row.experience, row.coins, row.stars].map(Number);
    if (
      !numbers.every(Number.isInteger) ||
      numbers[0]! <= 0 ||
      numbers.slice(1).some((item) => item < 0)
    ) {
      return `Награда${suffix} должна содержать целые неотрицательные значения и место от 1.`;
    }
  }
  return null;
}

function parseRewards(
  value: string,
): Array<{ place: number; experience: number; coins: number; stars: number }> {
  const error = rewardValidationError(value);
  if (error !== null) throw new Error(error);
  return rewardDraftRows(value).map((row) => ({
    place: Number(row.place),
    experience: Number(row.experience),
    coins: Number(row.coins),
    stars: Number(row.stars),
  }));
}

function parseNotificationOverrides(
  value: string,
): Record<string, { title: string; body: string; url: string }> {
  const rows = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [key = '', title = '', body = '', url = ''] = line
        .split('|')
        .map((part) => part.trim());
      return { key, title, body, url };
    });
  for (const row of rows) {
    if (!row.key.startsWith('tournament.')) throw new Error('Выберите событие уведомления.');
    if (!row.title) throw new Error('Заполните заголовок уведомления.');
    if (!row.body) throw new Error('Заполните текст уведомления.');
  }
  return Object.fromEntries(
    rows.map(({ key, title, body, url }) => [
      key,
      { title, body, url: url || '/?view=amateur&section=tournaments' },
    ]),
  );
}

function draftValidationError(draft: TournamentDraft): string | null {
  try {
    serializeDraft(draft);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Проверьте заполненные поля.';
  }
}

function notificationOverridesDraft(value: unknown): string {
  const overrides = objectValue(value);
  return Object.entries(overrides)
    .map(([key, setting]) => {
      const override = objectValue(setting);
      return [key, override.title, override.body, override.url].map(String).join('|');
    })
    .join('\n');
}

function playoffRoundCount(size: PlayoffSize): number {
  return Math.log2(size);
}

function freshDraft(): TournamentDraft {
  return {
    ...defaultDraft,
    playoffRounds: defaultDraft.playoffRounds.map((round) => ({ ...round })),
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function localDateTimeValue(value: string | null | undefined, timezone: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = timeZoneParts(date, timezone);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function rewardsDraft(value: unknown): string {
  return Array.isArray(value)
    ? value
        .map((entry) => {
          const reward = objectValue(entry);
          return [reward.place, reward.experience, reward.coins, reward.stars]
            .map((item) => numberValue(item, 0))
            .join(',');
        })
        .join('\n')
    : '';
}

function draftFromTournament(tournament: AdminTournament): TournamentDraft {
  const next = freshDraft();
  const rules = objectValue(tournament.rules);
  const config = objectValue(rules.config);
  const eligibility = objectValue(rules.eligibility);
  const scoring = objectValue(rules.regularScoring);
  const rewards = objectValue(rules.stageRewards);
  const configuredRounds = Array.isArray(rules.playoffRounds) ? rules.playoffRounds : [];
  const playoffSizeValue = numberValue(config.playoffSize, next.playoffSize);
  const playoffSize = ([2, 4, 8, 16] as number[]).includes(playoffSizeValue)
    ? (playoffSizeValue as PlayoffSize)
    : next.playoffSize;
  const timezone = stringValue(config.timezone, next.timezone);
  return {
    ...next,
    slug: tournament.slug,
    title: tournament.title,
    description: tournament.description,
    regularSource: config.regularSource === 'daily_aggregate' ? 'daily_aggregate' : 'head_to_head',
    registrationMode:
      config.registrationMode === 'approval' || config.registrationMode === 'invite_only'
        ? config.registrationMode
        : 'open',
    visibility: config.visibility === 'hidden' ? 'hidden' : 'public',
    participantLimit: numberValue(config.participantLimit, next.participantLimit),
    playoffSize,
    entryFeeCoins: numberValue(config.entryFeeCoins, 0),
    minLevel: eligibility.minLevel === null ? '' : String(eligibility.minLevel ?? ''),
    maxLevel: eligibility.maxLevel === null ? '' : String(eligibility.maxLevel ?? ''),
    minGoals: numberValue(eligibility.minGoals, 0),
    minExperience: numberValue(eligibility.minExperience, 0),
    invitedUserIds: Array.isArray(eligibility.invitedUserIds)
      ? eligibility.invitedUserIds.map(String).join(',')
      : '',
    bannedUserIds: Array.isArray(eligibility.bannedUserIds)
      ? eligibility.bannedUserIds.map(String).join(',')
      : '',
    timezone,
    registrationOpensAt: localDateTimeValue(tournament.registrationOpensAt, timezone),
    registrationClosesAt: localDateTimeValue(tournament.registrationClosesAt, timezone),
    startsAt: localDateTimeValue(tournament.startsAt, timezone),
    origin: {
      timezone,
      registrationOpensAt: tournament.registrationOpensAt ?? null,
      registrationClosesAt: tournament.registrationClosesAt ?? null,
      startsAt: tournament.startsAt ?? null,
    },
    roundRobinCycles: numberValue(config.roundRobinCycles, next.roundRobinCycles),
    roundsPerDay: numberValue(config.roundsPerDay, next.roundsPerDay),
    firstRoundLocalTime: stringValue(config.firstRoundLocalTime, next.firstRoundLocalTime),
    fixtureWindowMinutes:
      numberValue(config.fixtureWindowMs, next.fixtureWindowMinutes * 60_000) / 60_000,
    roundBreakMinutes: numberValue(config.roundBreakMs, next.roundBreakMinutes * 60_000) / 60_000,
    dailyDays: numberValue(config.dailyDays, next.dailyDays),
    dailyMetric:
      config.dailyMetric === 'accuracy_average' || config.dailyMetric === 'daily_place_points'
        ? config.dailyMetric
        : 'goals_sum',
    bestDays:
      config.bestDays === null || config.bestDays === undefined ? '' : String(config.bestDays),
    regularDuelTemplateId: stringValue(rules.regularDuelTemplateId),
    regulationWin: numberValue(scoring.regulationWin, next.regulationWin),
    overtimeWin: numberValue(scoring.overtimeWin, next.overtimeWin),
    overtimeLoss: numberValue(scoring.overtimeLoss, next.overtimeLoss),
    draw: numberValue(scoring.draw, next.draw),
    loss: numberValue(scoring.loss, next.loss),
    technicalLoss: numberValue(scoring.technicalLoss, next.technicalLoss),
    tieBreakCriteria: Array.isArray(rules.tieBreakCriteria)
      ? rules.tieBreakCriteria.map(String).join(',')
      : next.tieBreakCriteria,
    dailyPlacePoints: Array.isArray(rules.dailyPlacePoints)
      ? rules.dailyPlacePoints.map(String).join(',')
      : '',
    playoffRounds: next.playoffRounds.map((fallback, index) => {
      const configured = objectValue(
        configuredRounds.find((entry) => objectValue(entry).roundNumber === index + 1),
      );
      const overtime = objectValue(configured.overtime);
      return {
        winsRequired: numberValue(configured.winsRequired, fallback.winsRequired),
        duelTemplateId: stringValue(configured.duelTemplateId),
        homeSequence: Array.isArray(configured.homeSequence)
          ? configured.homeSequence.map(String).join('-')
          : fallback.homeSequence,
        gameWindowMinutes:
          numberValue(configured.gameWindowMs, fallback.gameWindowMinutes * 60_000) / 60_000,
        gameBreakMinutes:
          numberValue(configured.gameBreakMs, fallback.gameBreakMinutes * 60_000) / 60_000,
        roundBreakMinutes:
          numberValue(configured.roundBreakMs, fallback.roundBreakMinutes * 60_000) / 60_000,
        overtimeCount: numberValue(overtime.count, fallback.overtimeCount),
        shootoutInitialShots: numberValue(
          overtime.shootoutInitialShots,
          fallback.shootoutInitialShots,
        ),
      };
    }),
    regularRewards: rewardsDraft(rewards.regular),
    playoffRewards: rewardsDraft(rewards.playoff),
    reminderMinutes: Array.isArray(rules.notificationReminderOffsetsMs)
      ? rules.notificationReminderOffsetsMs.map((value) => numberValue(value, 0) / 60_000).join(',')
      : next.reminderMinutes,
    deadlineLeadMinutes:
      numberValue(rules.notificationDeadlineLeadMs, next.deadlineLeadMinutes * 60_000) / 60_000,
    notificationOverrides: notificationOverridesDraft(rules.notificationOverrides),
  };
}

function serializeDraft(draft: TournamentDraft): Record<string, unknown> {
  const configuredPlayoffRounds = draft.playoffRounds
    .slice(0, playoffRoundCount(draft.playoffSize))
    .map((round, index) => ({
      roundNumber: index + 1,
      winsRequired: round.winsRequired,
      homeSequence: normalizedHomeSequence(round.homeSequence, round.winsRequired),
      duelTemplateId: round.duelTemplateId || null,
      gameWindowMs: round.gameWindowMinutes * 60_000,
      gameBreakMs: round.gameBreakMinutes * 60_000,
      roundBreakMs: round.roundBreakMinutes * 60_000,
      overtime: { count: round.overtimeCount, shootoutInitialShots: round.shootoutInitialShots },
    }));
  return {
    title: draft.title,
    description: draft.description,
    startsAt: dateOrNull(
      draft.startsAt,
      draft.timezone,
      draft.origin && { iso: draft.origin.startsAt, timezone: draft.origin.timezone },
    ),
    registrationOpensAt: dateOrNull(
      draft.registrationOpensAt,
      draft.timezone,
      draft.origin && { iso: draft.origin.registrationOpensAt, timezone: draft.origin.timezone },
    ),
    registrationClosesAt: dateOrNull(
      draft.registrationClosesAt,
      draft.timezone,
      draft.origin && { iso: draft.origin.registrationClosesAt, timezone: draft.origin.timezone },
    ),
    rules: {
      config:
        draft.regularSource === 'head_to_head'
          ? {
              regularSource: 'head_to_head',
              participantLimit: draft.participantLimit,
              playoffSize: draft.playoffSize,
              timezone: draft.timezone,
              registrationMode: draft.registrationMode,
              visibility: draft.visibility,
              entryFeeCoins: draft.entryFeeCoins,
              roundRobinCycles: draft.roundRobinCycles,
              roundsPerDay: draft.roundsPerDay,
              firstRoundLocalTime: draft.firstRoundLocalTime,
              fixtureWindowMs: draft.fixtureWindowMinutes * 60_000,
              roundBreakMs: draft.roundBreakMinutes * 60_000,
              dailyDays: null,
              dailyMetric: null,
              bestDays: null,
            }
          : {
              regularSource: 'daily_aggregate',
              participantLimit: draft.participantLimit,
              playoffSize: draft.playoffSize,
              timezone: draft.timezone,
              registrationMode: draft.registrationMode,
              visibility: draft.visibility,
              entryFeeCoins: draft.entryFeeCoins,
              roundRobinCycles: null,
              roundsPerDay: null,
              firstRoundLocalTime: null,
              fixtureWindowMs: null,
              roundBreakMs: null,
              dailyDays: draft.dailyDays,
              dailyMetric: draft.dailyMetric,
              bestDays: optionalNumber(draft.bestDays),
            },
      eligibility: {
        minLevel: optionalNumber(draft.minLevel),
        maxLevel: optionalNumber(draft.maxLevel),
        minGoals: draft.minGoals,
        minExperience: draft.minExperience,
        invitedUserIds: splitList(draft.invitedUserIds),
        bannedUserIds: splitList(draft.bannedUserIds),
      },
      regularDuelTemplateId: draft.regularDuelTemplateId || null,
      regularScoring: {
        regulationWin: draft.regulationWin,
        overtimeWin: draft.overtimeWin,
        overtimeLoss: draft.overtimeLoss,
        draw: draft.draw,
        loss: draft.loss,
        technicalLoss: draft.technicalLoss,
      },
      tieBreakCriteria: splitList(draft.tieBreakCriteria),
      dailyPlacePoints: splitList(draft.dailyPlacePoints).map(Number).filter(Number.isFinite),
      playoffRounds: configuredPlayoffRounds,
      overtime: configuredPlayoffRounds[0]?.overtime ?? { count: 1, shootoutInitialShots: 3 },
      stageRewards: {
        regular: parseRewards(draft.regularRewards),
        playoff: parseRewards(draft.playoffRewards),
      },
      notificationReminderOffsetsMs: splitList(draft.reminderMinutes)
        .map(Number)
        .filter((minutes) => Number.isInteger(minutes) && minutes >= 0 && minutes <= 1_440)
        .map((minutes) => minutes * 60_000),
      notificationDeadlineLeadMs: draft.deadlineLeadMinutes * 60_000,
      notificationOverrides: parseNotificationOverrides(draft.notificationOverrides),
    },
  };
}

const tieBreakLabels: Record<string, string> = {
  points: 'Очки',
  wins: 'Победы',
  goal_difference: 'Разница голов',
  goals_for: 'Забитые голы',
};

function TieBreakEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const criteria = splitList(value).filter((criterion) => tieBreakLabels[criterion]);
  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= criteria.length) return;
    const next = [...criteria];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next.join(','));
  };
  return (
    <fieldset className="tournament-ordered-list">
      <legend>Критерии равенства</legend>
      <div className="tournament-ordered-list__hint">Применяются сверху вниз</div>
      {criteria.map((criterion, index) => (
        <div key={criterion} className="tournament-ordered-list__row">
          <strong>
            {index + 1}. {tieBreakLabels[criterion]}
          </strong>
          <div>
            <button
              type="button"
              className="admin-compact-btn"
              aria-label={`Поднять ${tieBreakLabels[criterion]}`}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              Выше
            </button>
            <button
              type="button"
              className="admin-compact-btn"
              aria-label={`Опустить ${tieBreakLabels[criterion]}`}
              disabled={index === criteria.length - 1}
              onClick={() => move(index, 1)}
            >
              Ниже
            </button>
          </div>
        </div>
      ))}
    </fieldset>
  );
}

function normalizedHomeSequence(value: string, winsRequired: number): Array<'H' | 'A'> {
  const desired = Math.max(1, winsRequired * 2 - 1);
  const configured = splitList(value, '-').map((side) => (side === 'A' ? 'A' : 'H'));
  return Array.from(
    { length: desired },
    (_, index) => configured[index] ?? (index % 2 ? 'A' : 'H'),
  );
}

function HomeSequenceEditor({
  roundNumber,
  winsRequired,
  value,
  onChange,
}: {
  roundNumber: number;
  winsRequired: number;
  value: string;
  onChange: (value: string) => void;
}) {
  const sequence = normalizedHomeSequence(value, winsRequired);
  return (
    <fieldset className="tournament-home-sequence">
      <legend>{`Раунд ${roundNumber}: порядок площадок`}</legend>
      <TournamentAdminGroupHelp>
        Нажмите на игру, чтобы переключить площадку. «Дом» использует арену игрока с более высоким
        посевом.
      </TournamentAdminGroupHelp>
      <div>
        {sequence.map((side, index) => (
          <button
            key={index}
            type="button"
            className={side === 'H' ? 'chip chip--active' : 'chip'}
            aria-label={`Раунд ${roundNumber}, игра ${index + 1}: ${side === 'H' ? 'Дома' : 'В гостях'}`}
            onClick={() => {
              const next = [...sequence];
              next[index] = side === 'H' ? 'A' : 'H';
              onChange(next.join('-'));
            }}
          >
            {index + 1}. {side === 'H' ? 'Дом' : 'Гости'}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function DailyPlacePointsEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const points = splitList(value).map(Number).filter(Number.isFinite);
  return (
    <fieldset className="tournament-structured-editor">
      <legend>Очки за места дня</legend>
      <TournamentAdminGroupHelp>
        Применяется только для метрики «Очки за место». Ничья делит среднее очков занятых позиций.
      </TournamentAdminGroupHelp>
      {points.map((pointsValue, index) => (
        <div className="tournament-table-row" key={index}>
          <span>{index + 1} место</span>
          <input
            aria-label={`Очки за ${index + 1} место`}
            type="number"
            min="0"
            value={pointsValue}
            onChange={(event) => {
              const next = [...points];
              next[index] = Number(event.target.value);
              onChange(next.join(','));
            }}
          />
          <button
            type="button"
            className="admin-compact-btn"
            aria-label={`Удалить ${index + 1} место`}
            onClick={() => onChange(points.filter((_, itemIndex) => itemIndex !== index).join(','))}
          >
            Удалить
          </button>
        </div>
      ))}
      <button
        type="button"
        className="admin-compact-btn"
        onClick={() => onChange([...points, 0].join(','))}
      >
        Добавить место
      </button>
    </fieldset>
  );
}

function RewardsEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const rewards = rewardDraftRows(value);
  const update = (
    index: number,
    field: 'place' | 'experience' | 'coins' | 'stars',
    fieldValue: string,
  ) => {
    const next = rewards.map((reward, rewardIndex) =>
      rewardIndex === index ? { ...reward, [field]: fieldValue } : reward,
    );
    onChange(serializeRewardRows(next));
  };
  const validationError = rewardValidationError(value, label);
  return (
    <fieldset className="tournament-structured-editor">
      <legend>Награды {label}</legend>
      <TournamentAdminGroupHelp>
        Укажите итоговое место и точное количество опыта, монет и звёзд. Пустая таблица означает
        отсутствие наград.
      </TournamentAdminGroupHelp>
      <div className="tournament-table-head">
        <span>Место</span>
        <span>Опыт</span>
        <span>Монеты</span>
        <span>Звёзды</span>
        <span />
      </div>
      {rewards.map((reward, index) => (
        <div className="tournament-table-row tournament-table-row--rewards" key={index}>
          {(['place', 'experience', 'coins', 'stars'] as const).map((field) => (
            <input
              key={field}
              type="number"
              min={field === 'place' ? 1 : 0}
              value={reward[field]}
              aria-label={`${field === 'place' ? 'Место' : field === 'experience' ? 'Опыт' : field === 'coins' ? 'Монеты' : 'Звёзды'} награды ${label} ${index + 1}`}
              onChange={(event) => update(index, field, event.target.value)}
            />
          ))}
          <button
            type="button"
            className="admin-compact-btn"
            aria-label={`Удалить награду ${label} ${index + 1}`}
            onClick={() =>
              onChange(
                serializeRewardRows(rewards.filter((_, rewardIndex) => rewardIndex !== index)),
              )
            }
          >
            Удалить
          </button>
        </div>
      ))}
      {validationError !== null && <div role="alert">{validationError}</div>}
      <button
        type="button"
        className="admin-compact-btn"
        onClick={() =>
          onChange(
            serializeRewardRows([
              ...rewards,
              { place: String(rewards.length + 1), experience: '0', coins: '0', stars: '0' },
            ]),
          )
        }
      >
        Добавить награду {label}
      </button>
    </fieldset>
  );
}

const notificationEvents = [
  ['tournament.application_approved', 'Заявка подтверждена'],
  ['tournament.schedule_published', 'Календарь опубликован'],
  ['tournament.fixture_opened', 'Окно игры открыто'],
  ['tournament.live_soon', 'Live-старт приближается'],
  ['tournament.deadline', 'Дедлайн'],
  ['tournament.result_ready', 'Результат'],
  ['tournament.rescheduled', 'Перенос'],
  ['tournament.playoff_started', 'Плей-офф'],
  ['tournament.next_series_game', 'Следующая игра серии'],
  ['tournament.completed', 'Итог турнира'],
] as const;

function NotificationEditor({
  reminders,
  overrides,
  onRemindersChange,
  onOverridesChange,
}: {
  reminders: string;
  overrides: string;
  onRemindersChange: (value: string) => void;
  onOverridesChange: (value: string) => void;
}) {
  const [eventToAdd, setEventToAdd] = useState('');
  const reminderValues = splitList(reminders).map(Number).filter(Number.isFinite);
  const parsed = Object.fromEntries(
    overrides
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [key = '', title = '', body = '', url = ''] = line
          .split('|')
          .map((part) => part.trim());
        return [key, { title, body, url }] as const;
      }),
  );
  const selected = Object.keys(parsed);
  let validationError: string | null = null;
  try {
    parseNotificationOverrides(overrides);
  } catch (error) {
    validationError = error instanceof Error ? error.message : 'Проверьте уведомления.';
  }
  const serialize = (next: Record<string, { title: string; body: string; url: string }>) =>
    Object.entries(next)
      .map(([key, item]) => `${key}|${item.title}|${item.body}|${item.url}`)
      .join('\n');
  return (
    <>
      <fieldset className="tournament-structured-editor">
        <legend>Напоминания до старта</legend>
        <TournamentAdminGroupHelp>
          Несколько отдельных push-напоминаний, отсчитанных назад от начала игры.
        </TournamentAdminGroupHelp>
        {reminderValues.map((minutes, index) => (
          <div className="tournament-table-row" key={index}>
            <input
              type="number"
              min="0"
              max="1440"
              aria-label={`Напоминание ${index + 1}, минуты`}
              value={minutes}
              onChange={(event) => {
                const next = [...reminderValues];
                next[index] = Number(event.target.value);
                onRemindersChange(next.join(','));
              }}
            />
            <span>минут</span>
            <button
              type="button"
              className="admin-compact-btn"
              onClick={() =>
                onRemindersChange(
                  reminderValues.filter((_, itemIndex) => itemIndex !== index).join(','),
                )
              }
            >
              Удалить
            </button>
          </div>
        ))}
        <button
          type="button"
          className="admin-compact-btn"
          onClick={() => onRemindersChange([...reminderValues, 15].join(','))}
        >
          Добавить напоминание
        </button>
      </fieldset>
      <fieldset className="tournament-structured-editor">
        <legend>Уведомления</legend>
        <TournamentAdminGroupHelp>
          Настройте собственный текст только для событий, где глобального шаблона недостаточно.
        </TournamentAdminGroupHelp>
        {selected.map((key) => {
          const item = parsed[key]!;
          return (
            <div className="tournament-notification-card" key={key}>
              <strong>{notificationEvents.find(([event]) => event === key)?.[1] ?? key}</strong>
              <TournamentAdminField
                label="Заголовок"
                help="Короткая строка, которую игрок увидит первой."
              >
                <input
                  aria-label={`${notificationEvents.find(([event]) => event === key)?.[1] ?? key}: заголовок`}
                  value={item.title}
                  onChange={(event) =>
                    onOverridesChange(
                      serialize({ ...parsed, [key]: { ...item, title: event.target.value } }),
                    )
                  }
                />
              </TournamentAdminField>
              <TournamentAdminField
                label="Текст"
                help="Основное сообщение; можно использовать переменные турнира."
              >
                <textarea
                  aria-label={`${notificationEvents.find(([event]) => event === key)?.[1] ?? key}: текст`}
                  className="tournament-admin-textarea tournament-admin-textarea--compact"
                  value={item.body}
                  onChange={(event) =>
                    onOverridesChange(
                      serialize({ ...parsed, [key]: { ...item, body: event.target.value } }),
                    )
                  }
                />
              </TournamentAdminField>
              <TournamentAdminField
                label="Ссылка"
                help="Экран, который откроется после нажатия на уведомление."
              >
                <input
                  aria-label={`${notificationEvents.find(([event]) => event === key)?.[1] ?? key}: ссылка`}
                  value={item.url}
                  onChange={(event) =>
                    onOverridesChange(
                      serialize({ ...parsed, [key]: { ...item, url: event.target.value } }),
                    )
                  }
                />
              </TournamentAdminField>
              <button
                type="button"
                className="admin-compact-btn"
                onClick={() => {
                  const next = { ...parsed };
                  delete next[key];
                  onOverridesChange(serialize(next));
                }}
              >
                Удалить настройку
              </button>
            </div>
          );
        })}
        {validationError !== null && <div role="alert">{validationError}</div>}
        <TournamentAdminField
          label="Событие"
          help="Выберите событие, для которого нужен отдельный текст уведомления."
        >
          <GlassSelect
            ariaLabel="Событие уведомления"
            value={eventToAdd}
            options={[
              { value: '', label: 'Выберите событие' },
              ...notificationEvents
                .filter(([key]) => !selected.includes(key))
                .map(([value, label]) => ({ value, label })),
            ]}
            onChange={setEventToAdd}
          />
        </TournamentAdminField>
        <button
          type="button"
          className="admin-compact-btn"
          disabled={!eventToAdd}
          onClick={() => {
            const key = eventToAdd;
            if (key)
              onOverridesChange(
                serialize({
                  ...parsed,
                  [key]: {
                    title: 'Турнир',
                    body: 'Новое событие турнира',
                    url: '/?view=amateur&section=tournaments',
                  },
                }),
              );
            setEventToAdd('');
          }}
        >
          Настроить событие
        </button>
      </fieldset>
    </>
  );
}

function TournamentPlayerPicker({
  kind,
  value,
  excludedValue,
  onChange,
}: {
  kind: 'invited' | 'banned';
  value: string;
  excludedValue: string;
  onChange: (value: string) => void;
}): JSX.Element {
  const [search, setSearch] = useState('');
  const selectedIds = splitList(value);
  const excludedIds = new Set(splitList(excludedValue));
  const users = useQuery({
    queryKey: ['admin', 'tournament-user-picker', search],
    queryFn: () => fetchAdminTournamentUsers(search),
    enabled: search.trim().length >= 2,
  });
  const selectedUsers = useQuery({
    queryKey: ['admin', 'tournament-selected-users', selectedIds],
    queryFn: async () => {
      const results = await Promise.all(
        selectedIds.map((userId) => fetchAdminTournamentUsers(userId)),
      );
      return results
        .flatMap((result) => result.users)
        .filter(
          (user, index, all) =>
            selectedIds.includes(user.id) &&
            all.findIndex((candidate) => candidate.id === user.id) === index,
        );
    },
    enabled: selectedIds.length > 0,
  });
  const resultById = new Map(
    [...(selectedUsers.data ?? []), ...(users.data?.users ?? [])].map(
      (user) => [user.id, user] as const,
    ),
  );
  const label = kind === 'invited' ? 'Приглашённые игроки' : 'Запрещённые игроки';
  const searchLabel =
    kind === 'invited' ? 'Найти приглашённого игрока' : 'Найти запрещённого игрока';

  const userLabel = (user: AdminTournamentUserOption): string => {
    const username = user.identities.find((identity) => identity.username)?.username;
    return username ? `${user.displayName} · @${username}` : user.displayName;
  };

  return (
    <fieldset className="tournament-picker">
      <legend>{label}</legend>
      <TournamentAdminGroupHelp>
        {kind === 'invited'
          ? 'Найдите игроков по имени или username. ID используются только внутри системы.'
          : 'Эти игроки не смогут подать заявку или принять приглашение.'}
      </TournamentAdminGroupHelp>
      <input
        type="search"
        aria-label={searchLabel}
        placeholder="Имя или username"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {selectedIds.length > 0 && (
        <div className="tournament-picker__selected">
          {selectedIds.map((userId) => (
            <button
              key={userId}
              type="button"
              className="chip"
              aria-label={`Убрать ${resultById.get(userId)?.displayName ?? 'выбранного игрока'}`}
              onClick={() => onChange(selectedIds.filter((id) => id !== userId).join(','))}
            >
              {resultById.get(userId)?.avatarUrl && (
                <img src={resultById.get(userId)!.avatarUrl!} alt="" />
              )}
              {resultById.get(userId)?.displayName ?? 'Загрузка игрока…'} ×
            </button>
          ))}
        </div>
      )}
      {search.trim().length >= 2 && (
        <div className="tournament-picker__results">
          {(users.data?.users ?? []).map((user) => {
            const unavailable =
              selectedIds.includes(user.id) ||
              excludedIds.has(user.id) ||
              (kind === 'invited' && user.isBlocked);
            return (
              <button
                key={user.id}
                type="button"
                className="tournament-picker__result"
                aria-label={`Добавить ${user.displayName}`}
                disabled={unavailable}
                onClick={() => onChange([...selectedIds, user.id].join(','))}
              >
                {user.avatarUrl && <img src={user.avatarUrl} alt="" />}
                <span>{userLabel(user)}</span>
                <small>Уровень {user.level}</small>
              </button>
            );
          })}
          {users.isSuccess && users.data.users.length === 0 && <span>Никого не нашли</span>}
        </div>
      )}
    </fieldset>
  );
}

export function TournamentAdmin(): JSX.Element {
  const client = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const tournaments = useQuery({
    queryKey: ['admin', 'tournaments'],
    queryFn: fetchAdminTournaments,
  });
  const duelTemplates = useQuery({
    queryKey: ['admin', 'duel-templates', 'tournament-picker'],
    queryFn: fetchAdminTournamentDuelTemplates,
    enabled: wizardOpen,
  });
  const [stage, setStage] = useState(0);
  const [maxStage, setMaxStage] = useState(0);
  const [saveState, setSaveState] = useState<TournamentDraftSaveStatus>('idle');
  const [finishing, setFinishing] = useState(false);
  const [draft, setDraft] = useState(freshDraft);
  const [editingTournament, setEditingTournament] = useState<AdminTournament | null>(null);
  const [selectedTournament, setSelectedTournament] = useState<AdminTournament | null>(null);
  const lastSavedSnapshot = useRef('');
  const saveQueue =
    useRef<
      TournamentDraftSaveQueue<ReturnType<typeof serializeDraft>, { tournament: AdminTournament }>
    >();
  const saveDebounce = useRef<number>();
  const saveQueueGeneration = useRef(0);
  const createInFlight = useRef(false);
  const validationError = draftValidationError(draft);

  const initializeSaveQueue = (tournament: AdminTournament, snapshot: string) => {
    const generation = saveQueueGeneration.current + 1;
    saveQueueGeneration.current = generation;
    saveQueue.current = new TournamentDraftSaveQueue({
      initialRevision: tournament.revision,
      initialSnapshotKey: snapshot,
      save: (body, expectedRevision) =>
        updateAdminTournament(tournament.id, expectedRevision, body),
      revisionOf: (result) => result.tournament.revision,
      onStatusChange: (status) => {
        if (saveQueueGeneration.current === generation) setSaveState(status);
      },
      onSaved: (result, savedSnapshot) => {
        if (saveQueueGeneration.current !== generation) return;
        lastSavedSnapshot.current = savedSnapshot;
        setEditingTournament(result.tournament);
        void client.invalidateQueries({ queryKey: ['admin', 'tournaments'] });
      },
    });
  };

  const create = useMutation({
    mutationFn: ({ body }: { body: ReturnType<typeof serializeDraft>; snapshot: string }) =>
      createAdminTournament(body),
    onMutate: () => setSaveState('saving'),
    onSuccess: ({ tournament }, variables) => {
      lastSavedSnapshot.current = variables.snapshot;
      initializeSaveQueue(tournament, variables.snapshot);
      setEditingTournament(tournament);
      setStage(1);
      setMaxStage(1);
      setSaveState('saved');
      void client.invalidateQueries({ queryKey: ['admin', 'tournaments'] });
    },
    onError: () => setSaveState('error'),
    onSettled: () => {
      createInFlight.current = false;
    },
  });

  const enqueueCurrentDraft = () => {
    if (editingTournament === null || saveQueue.current === undefined) return;
    const body = serializeDraft(draft);
    saveQueue.current.enqueue(body, JSON.stringify(body));
  };

  useEffect(() => {
    if (!wizardOpen || editingTournament === null || create.isPending) return;
    let snapshot: string;
    let body: ReturnType<typeof serializeDraft>;
    try {
      body = serializeDraft(draft);
      snapshot = JSON.stringify(body);
    } catch {
      setSaveState('error');
      return;
    }
    if (snapshot === lastSavedSnapshot.current) {
      const queueStatus = saveQueue.current?.status;
      if (queueStatus === 'saving') {
        saveQueue.current?.enqueue(body, snapshot);
      } else if (queueStatus !== 'error') {
        setSaveState('saved');
      }
      return;
    }
    setSaveState('saving');
    saveDebounce.current = window.setTimeout(() => {
      saveQueue.current?.enqueue(body, snapshot);
    }, 600);
    return () => window.clearTimeout(saveDebounce.current);
  }, [draft, editingTournament?.id, wizardOpen, create.isPending]);
  const updatePlayoffRound = (index: number, patch: Partial<PlayoffRoundDraft>) => {
    setDraft((current) => ({
      ...current,
      playoffRounds: current.playoffRounds.map((round, roundIndex) =>
        roundIndex === index ? { ...round, ...patch } : round,
      ),
    }));
  };
  const closeWizard = (tournament: AdminTournament | null = editingTournament) => {
    if (saveDebounce.current !== undefined) window.clearTimeout(saveDebounce.current);
    saveQueueGeneration.current += 1;
    saveQueue.current = undefined;
    setWizardOpen(false);
    setConfirmClose(false);
    setFinishing(false);
    if (tournament !== null) setSelectedTournament(tournament);
    setEditingTournament(null);
  };
  const requestClose = () => {
    let currentSnapshot = '';
    try {
      currentSnapshot = JSON.stringify(serializeDraft(draft));
    } catch {
      /* invalid input is unsaved */
    }
    if (
      saveState === 'saving' ||
      saveState === 'error' ||
      currentSnapshot !== (saveQueue.current?.snapshotKey ?? lastSavedSnapshot.current)
    ) {
      setConfirmClose(true);
      return;
    }
    closeWizard();
  };

  const finishWizard = async () => {
    if (!draft.title.trim() || finishing || validationError !== null) return;
    setFinishing(true);
    if (saveDebounce.current !== undefined) window.clearTimeout(saveDebounce.current);
    try {
      if (editingTournament === null) {
        if (createInFlight.current) return;
        createInFlight.current = true;
        const body = serializeDraft(draft);
        const result = await create.mutateAsync({ body, snapshot: JSON.stringify(body) });
        closeWizard(result.tournament);
        return;
      }
      enqueueCurrentDraft();
      const result = await saveQueue.current?.flush();
      closeWizard(result?.tournament ?? editingTournament);
    } catch {
      setFinishing(false);
    }
  };

  if (selectedTournament !== null) {
    return (
      <TournamentOperations
        tournament={selectedTournament}
        onBack={() => setSelectedTournament(null)}
        onEdit={() => {
          setEditingTournament(selectedTournament);
          const nextDraft = draftFromTournament(selectedTournament);
          setDraft(nextDraft);
          const snapshot = JSON.stringify(serializeDraft(nextDraft));
          lastSavedSnapshot.current = snapshot;
          initializeSaveQueue(selectedTournament, snapshot);
          setStage(0);
          setMaxStage(7);
          setSaveState('saved');
          setWizardOpen(true);
          setSelectedTournament(null);
        }}
        onRemoved={() => setSelectedTournament(null)}
      />
    );
  }
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}
      >
        <div>
          <div className="section-label" style={{ margin: 0 }}>
            Турниры
          </div>
          <h2 style={{ margin: '4px 0 0' }}>Управление сезонами</h2>
        </div>
        <button
          type="button"
          className="chip chip--active"
          aria-label="Создать"
          onClick={() => {
            saveQueueGeneration.current += 1;
            saveQueue.current = undefined;
            setEditingTournament(null);
            const nextDraft = freshDraft();
            setDraft(nextDraft);
            lastSavedSnapshot.current = JSON.stringify(serializeDraft(nextDraft));
            setStage(0);
            setMaxStage(0);
            setSaveState('idle');
            setFinishing(false);
            setWizardOpen(true);
          }}
        >
          + Создать
        </button>
      </div>
      {tournaments.data?.tournaments.length === 0 && (
        <div className="glass" style={{ borderRadius: 22, padding: 18 }}>
          Турниров пока нет
        </div>
      )}
      {tournaments.data?.tournaments.map((tournament) => (
        <button
          key={tournament.id}
          type="button"
          aria-label={`Открыть ${tournament.title}`}
          className="glass"
          style={{
            borderRadius: 22,
            padding: 16,
            textAlign: 'left',
            border: '1px solid rgba(255,255,255,.78)',
          }}
          onClick={() => {
            setSelectedTournament(tournament);
          }}
        >
          <div className="section-label" style={{ margin: 0 }}>
            {tournament.status} · ревизия {tournament.revision}
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 5 }}>{tournament.title}</div>
          <div style={{ color: 'var(--muted)', marginTop: 4 }}>
            {tournament.participantCount} участников
          </div>
        </button>
      ))}
      {wizardOpen &&
        createPortal(
          <div className="modal-backdrop admin-screen" role="presentation">
            <section
              className="modal-card tournament-wizard"
              role="dialog"
              aria-modal="true"
              aria-label="Создание турнира"
              style={{ height: 'min(var(--app-viewport-height, 100dvh), 860px)' }}
            >
              <div className="modal-header tournament-wizard__header">
                <h2 className="modal-title" style={{ margin: 0 }}>
                  {editingTournament === null ? 'Новый турнир' : 'Редактирование турнира'}
                </h2>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Закрыть"
                  onClick={requestClose}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="tournament-wizard__steps" aria-label="Этапы создания турнира">
                {stages.map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    className={stage === index ? 'chip chip--active' : 'chip'}
                    disabled={index > maxStage}
                    onClick={() => setStage(index)}
                  >
                    {index + 1}. {label}
                  </button>
                ))}
              </div>
              <div className="modal-copy tournament-wizard__body">
                {stage === 0 && (
                  <div className="tournament-admin-grid tournament-admin-grid--single">
                    <TournamentAdminField
                      label="Название"
                      help="Так турнир будет называться в каталоге, календаре и уведомлениях."
                    >
                      <input
                        aria-label="Название"
                        value={draft.title}
                        onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                      />
                    </TournamentAdminField>
                    <TournamentAdminField
                      label="Описание"
                      help="Коротко объясните формат и главную идею турнира для участников."
                    >
                      <textarea
                        aria-label="Описание"
                        className="tournament-admin-textarea"
                        value={draft.description}
                        onChange={(event) =>
                          setDraft({ ...draft, description: event.target.value })
                        }
                      />
                    </TournamentAdminField>
                  </div>
                )}
                {stage === 1 && (
                  <div className="tournament-admin-grid">
                    <TournamentAdminField
                      label="Регистрация"
                      help="Открытая принимает всех, одобрение требует решения администратора, приглашения закрывают свободную подачу."
                    >
                      <GlassSelect
                        ariaLabel="Регистрация"
                        value={draft.registrationMode}
                        options={[
                          { value: 'open', label: 'Открытая' },
                          { value: 'approval', label: 'С одобрением' },
                          { value: 'invite_only', label: 'Только по приглашению' },
                        ]}
                        onChange={(registrationMode: RegistrationMode) =>
                          setDraft({ ...draft, registrationMode })
                        }
                      />
                    </TournamentAdminField>
                    <TournamentAdminField
                      label="Видимость"
                      help="Публичный турнир виден в каталоге; скрытый доступен только по прямому приглашению."
                    >
                      <GlassSelect
                        ariaLabel="Видимость"
                        value={draft.visibility}
                        options={[
                          { value: 'public', label: 'Публичный' },
                          { value: 'hidden', label: 'Скрытый' },
                        ]}
                        onChange={(visibility: Visibility) => setDraft({ ...draft, visibility })}
                      />
                    </TournamentAdminField>
                    <TournamentAdminField
                      label="Вступительный взнос, монеты"
                      help="Фиксированная сумма списывается при подтверждении участия; 0 означает бесплатно."
                    >
                      <input
                        aria-label="Вступительный взнос, монеты"
                        type="number"
                        min="0"
                        value={draft.entryFeeCoins}
                        onChange={(event) =>
                          setDraft({ ...draft, entryFeeCoins: Number(event.target.value) })
                        }
                      />
                    </TournamentAdminField>
                    <TournamentAdminField
                      label="Минимальный уровень"
                      help="Игроки ниже этого уровня не смогут участвовать; пусто — без ограничения."
                    >
                      <input
                        aria-label="Минимальный уровень"
                        type="number"
                        min="1"
                        value={draft.minLevel}
                        onChange={(event) => setDraft({ ...draft, minLevel: event.target.value })}
                      />
                    </TournamentAdminField>
                    <TournamentAdminField
                      label="Максимальный уровень"
                      help="Игроки выше этого уровня не смогут участвовать; пусто — без ограничения."
                    >
                      <input
                        aria-label="Максимальный уровень"
                        type="number"
                        min="1"
                        value={draft.maxLevel}
                        onChange={(event) => setDraft({ ...draft, maxLevel: event.target.value })}
                      />
                    </TournamentAdminField>
                    <TournamentAdminField
                      label="Минимум голов"
                      help="Минимальное число голов за всё время, необходимое для допуска."
                    >
                      <input
                        aria-label="Минимум голов"
                        type="number"
                        min="0"
                        value={draft.minGoals}
                        onChange={(event) =>
                          setDraft({ ...draft, minGoals: Number(event.target.value) })
                        }
                      />
                    </TournamentAdminField>
                    <TournamentAdminField
                      label="Минимум опыта"
                      help="Минимальный накопленный опыт игрока для подачи заявки."
                    >
                      <input
                        aria-label="Минимум опыта"
                        type="number"
                        min="0"
                        value={draft.minExperience}
                        onChange={(event) =>
                          setDraft({ ...draft, minExperience: Number(event.target.value) })
                        }
                      />
                    </TournamentAdminField>
                    <div className="tournament-admin-grid__wide">
                      <TournamentPlayerPicker
                        kind="invited"
                        value={draft.invitedUserIds}
                        excludedValue={draft.bannedUserIds}
                        onChange={(invitedUserIds) => setDraft({ ...draft, invitedUserIds })}
                      />
                      <TournamentPlayerPicker
                        kind="banned"
                        value={draft.bannedUserIds}
                        excludedValue={draft.invitedUserIds}
                        onChange={(bannedUserIds) => setDraft({ ...draft, bannedUserIds })}
                      />
                    </div>
                  </div>
                )}
                {stage === 2 && (
                  <div className="tournament-admin-grid">
                    <TournamentAdminField
                      label="Формат"
                      help="«Каждый с каждым» создаёт личные дуэли; дневной зачёт сравнивает результаты обычной daily-игры."
                    >
                      <GlassSelect
                        ariaLabel="Формат"
                        value={draft.regularSource}
                        options={[
                          { value: 'head_to_head', label: 'Каждый с каждым' },
                          { value: 'daily_aggregate', label: 'Результаты ежедневных игр' },
                        ]}
                        onChange={(regularSource: RegularSource) =>
                          setDraft({ ...draft, regularSource })
                        }
                      />
                    </TournamentAdminField>
                    <TournamentAdminField
                      label="Участников"
                      help="Максимум подтверждённых участников: до 64 для дуэлей и до 10 000 для дневного зачёта."
                    >
                      <input
                        aria-label="Участников"
                        type="number"
                        min="2"
                        max={draft.regularSource === 'head_to_head' ? 64 : 10_000}
                        value={draft.participantLimit}
                        onChange={(event) =>
                          setDraft({ ...draft, participantLimit: Number(event.target.value) })
                        }
                      />
                    </TournamentAdminField>
                    {draft.regularSource === 'head_to_head' ? (
                      <>
                        <TournamentAdminField
                          label="Кругов"
                          help="Сколько раз каждый сыграет с каждым. Чётные круги делятся поровну дома и в гостях; лишний нечётный — нейтральный."
                        >
                          <input
                            aria-label="Кругов"
                            type="number"
                            min="1"
                            max="20"
                            value={draft.roundRobinCycles}
                            onChange={(event) =>
                              setDraft({ ...draft, roundRobinCycles: Number(event.target.value) })
                            }
                          />
                        </TournamentAdminField>
                        <TournamentAdminField
                          label="Туров в день"
                          help="Сколько последовательных туров календарь поставит в одни календарные сутки."
                        >
                          <input
                            aria-label="Туров в день"
                            type="number"
                            min="1"
                            max="24"
                            value={draft.roundsPerDay}
                            onChange={(event) =>
                              setDraft({ ...draft, roundsPerDay: Number(event.target.value) })
                            }
                          />
                        </TournamentAdminField>
                        <TournamentAdminField
                          label="Первый тур дня"
                          help="Локальное время открытия первого игрового окна каждого дня."
                        >
                          <input
                            aria-label="Первый тур дня"
                            type="time"
                            value={draft.firstRoundLocalTime}
                            onChange={(event) =>
                              setDraft({ ...draft, firstRoundLocalTime: event.target.value })
                            }
                          />
                        </TournamentAdminField>
                        <TournamentAdminField
                          label="Окно игры, минуты"
                          help="Сколько времени игрокам даётся на завершение одной турнирной дуэли."
                        >
                          <input
                            aria-label="Окно игры, минуты"
                            type="number"
                            min="1"
                            value={draft.fixtureWindowMinutes}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                fixtureWindowMinutes: Number(event.target.value),
                              })
                            }
                          />
                        </TournamentAdminField>
                        <TournamentAdminField
                          label="Пауза между турами, минуты"
                          help="Перерыв после закрытия окна тура до открытия следующего."
                        >
                          <input
                            aria-label="Пауза между турами, минуты"
                            type="number"
                            min="0"
                            value={draft.roundBreakMinutes}
                            onChange={(event) =>
                              setDraft({ ...draft, roundBreakMinutes: Number(event.target.value) })
                            }
                          />
                        </TournamentAdminField>
                        <TournamentAdminField
                          label="Шаблон дуэли регулярки"
                          help="Определяет периоды и число бросков. В списке только активные шаблоны; ранее выбранный архивный сохраняется."
                        >
                          <GlassSelect
                            ariaLabel="Шаблон дуэли регулярки"
                            value={draft.regularDuelTemplateId}
                            options={[
                              { value: '', label: 'Выберите шаблон' },
                              ...(duelTemplates.data?.templates ?? [])
                                .filter(
                                  (template) =>
                                    template.isActive ||
                                    template.id === draft.regularDuelTemplateId,
                                )
                                .map((template) => ({
                                  value: template.id,
                                  label: `${template.title} · ${template.totalPeriods} пер. · ${template.shotsPerPeriod} бросков${!template.isActive ? ' · архивный' : ''}`,
                                })),
                            ]}
                            onChange={(regularDuelTemplateId) =>
                              setDraft({ ...draft, regularDuelTemplateId })
                            }
                          />
                        </TournamentAdminField>
                        <details className="tournament-admin-details tournament-admin-grid__wide">
                          <summary>Тонкие настройки очков</summary>
                          <TournamentAdminGroupHelp>
                            Эти значения определяют таблицу регулярки. Если схема стандартная,
                            оставьте значения по умолчанию.
                          </TournamentAdminGroupHelp>
                          <div className="tournament-admin-grid">
                            {(
                              [
                                [
                                  'regulationWin',
                                  'Победа в основное время',
                                  'Полные очки за победу без овертайма.',
                                ],
                                [
                                  'overtimeWin',
                                  'Победа в овертайме',
                                  'Очки победителю после овертайма или буллитов.',
                                ],
                                [
                                  'overtimeLoss',
                                  'Поражение в овертайме',
                                  'Компенсационные очки проигравшему в овертайме.',
                                ],
                                [
                                  'draw',
                                  'Ничья',
                                  'Очки каждому, если формат допускает ничейный итог.',
                                ],
                                [
                                  'loss',
                                  'Обычное поражение',
                                  'Очки за поражение в основное время.',
                                ],
                                [
                                  'technicalLoss',
                                  'Техническое поражение',
                                  'Очки неявившемуся или снятому участнику.',
                                ],
                              ] as const
                            ).map(([field, label, help]) => (
                              <TournamentAdminField key={field} label={label} help={help}>
                                <input
                                  aria-label={`Очки: ${label.toLowerCase()}`}
                                  type="number"
                                  value={draft[field]}
                                  onChange={(event) =>
                                    setDraft({ ...draft, [field]: Number(event.target.value) })
                                  }
                                />
                              </TournamentAdminField>
                            ))}
                            <div className="tournament-admin-grid__wide">
                              <TieBreakEditor
                                value={draft.tieBreakCriteria}
                                onChange={(tieBreakCriteria) =>
                                  setDraft({ ...draft, tieBreakCriteria })
                                }
                              />
                            </div>
                          </div>
                        </details>
                      </>
                    ) : (
                      <>
                        <TournamentAdminField
                          label="Дней регулярки"
                          help="Сколько календарных дней учитывается до формирования итоговой таблицы."
                        >
                          <input
                            aria-label="Дней регулярки"
                            type="number"
                            min="1"
                            max="366"
                            value={draft.dailyDays}
                            onChange={(event) =>
                              setDraft({ ...draft, dailyDays: Number(event.target.value) })
                            }
                          />
                        </TournamentAdminField>
                        <TournamentAdminField
                          label="Метрика дня"
                          help="Что именно сравнивать: голы, точность или заранее заданные очки за занятое место."
                        >
                          <GlassSelect
                            ariaLabel="Метрика дня"
                            value={draft.dailyMetric}
                            options={[
                              { value: 'goals_sum', label: 'Сумма голов' },
                              { value: 'accuracy_average', label: 'Средняя точность' },
                              { value: 'daily_place_points', label: 'Очки за место' },
                            ]}
                            onChange={(dailyMetric: DailyMetric) =>
                              setDraft({ ...draft, dailyMetric })
                            }
                          />
                        </TournamentAdminField>
                        <TournamentAdminField
                          label="Учитывать лучшие N дней"
                          help="Оставьте пустым, чтобы считать все дни; число исключит худшие результаты."
                        >
                          <input
                            aria-label="Учитывать лучшие N дней"
                            type="number"
                            min="1"
                            value={draft.bestDays}
                            onChange={(event) =>
                              setDraft({ ...draft, bestDays: event.target.value })
                            }
                            placeholder="Пусто — все дни"
                          />
                        </TournamentAdminField>
                        <div className="tournament-admin-grid__wide">
                          <DailyPlacePointsEditor
                            value={draft.dailyPlacePoints}
                            onChange={(dailyPlacePoints) =>
                              setDraft({ ...draft, dailyPlacePoints })
                            }
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
                {stage === 3 && (
                  <div className="tournament-admin-grid tournament-admin-grid--single">
                    <TournamentAdminField
                      label="Размер плей-офф"
                      help="Сколько лучших игроков попадут в фиксированную сетку: 2, 4, 8 или 16."
                    >
                      <GlassSelect
                        ariaLabel="Размер плей-офф"
                        value={String(draft.playoffSize)}
                        options={[2, 4, 8, 16].map((size) => ({
                          value: String(size),
                          label: `${size} участников`,
                        }))}
                        onChange={(value) =>
                          setDraft({ ...draft, playoffSize: Number(value) as PlayoffSize })
                        }
                      />
                    </TournamentAdminField>
                    {draft.playoffRounds
                      .slice(0, playoffRoundCount(draft.playoffSize))
                      .map((round, index) => (
                        <fieldset key={index} className="tournament-playoff-round">
                          <legend>Раунд {index + 1}</legend>
                          <TournamentAdminGroupHelp>
                            Основные правила серии. Более редкие тайминги и овертайм скрыты ниже.
                          </TournamentAdminGroupHelp>
                          <TournamentAdminField
                            label="Побед для серии"
                            help="Серия завершится, когда один игрок первым наберёт это число побед."
                          >
                            <input
                              aria-label={`Раунд ${index + 1}: побед для серии`}
                              type="number"
                              min="1"
                              max="20"
                              value={round.winsRequired}
                              onChange={(event) =>
                                updatePlayoffRound(index, {
                                  winsRequired: Number(event.target.value),
                                })
                              }
                            />
                          </TournamentAdminField>
                          <TournamentAdminField
                            label="Шаблон дуэли"
                            help="Периоды и броски для каждой игры этого раунда."
                          >
                            <GlassSelect
                              ariaLabel={`Раунд ${index + 1}: шаблон дуэли`}
                              value={round.duelTemplateId}
                              options={[
                                { value: '', label: 'Выберите шаблон' },
                                ...(duelTemplates.data?.templates ?? [])
                                  .filter(
                                    (template) =>
                                      template.isActive || template.id === round.duelTemplateId,
                                  )
                                  .map((template) => ({
                                    value: template.id,
                                    label: `${template.title}${!template.isActive ? ' · архивный' : ''}`,
                                  })),
                              ]}
                              onChange={(duelTemplateId) =>
                                updatePlayoffRound(index, { duelTemplateId })
                              }
                            />
                          </TournamentAdminField>
                          <HomeSequenceEditor
                            roundNumber={index + 1}
                            winsRequired={round.winsRequired}
                            value={round.homeSequence}
                            onChange={(homeSequence) => updatePlayoffRound(index, { homeSequence })}
                          />
                          <details className="tournament-admin-details">
                            <summary>Тайминги, овертайм и буллиты</summary>
                            <div className="tournament-admin-grid">
                              {(
                                [
                                  [
                                    'gameWindowMinutes',
                                    'Окно игры, минуты',
                                    1,
                                    'Время на завершение одной игры серии.',
                                  ],
                                  [
                                    'gameBreakMinutes',
                                    'Пауза между играми, минуты',
                                    0,
                                    'Перерыв до следующей условной игры серии.',
                                  ],
                                  [
                                    'roundBreakMinutes',
                                    'Пауза после раунда, минуты',
                                    0,
                                    'Перерыв перед открытием следующего раунда сетки.',
                                  ],
                                  [
                                    'overtimeCount',
                                    'Овертаймов',
                                    0,
                                    'Сколько дополнительных сегментов сыграть до буллитов.',
                                  ],
                                  [
                                    'shootoutInitialShots',
                                    'Бросков в буллитах',
                                    1,
                                    'Начальная равная серия бросков каждому игроку.',
                                  ],
                                ] as const
                              ).map(([field, label, min, help]) => (
                                <TournamentAdminField key={field} label={label} help={help}>
                                  <input
                                    aria-label={`Раунд ${index + 1}: ${label.toLowerCase()}`}
                                    type="number"
                                    min={min}
                                    value={round[field]}
                                    onChange={(event) =>
                                      updatePlayoffRound(index, {
                                        [field]: Number(event.target.value),
                                      })
                                    }
                                  />
                                </TournamentAdminField>
                              ))}
                            </div>
                          </details>
                        </fieldset>
                      ))}
                  </div>
                )}
                {stage === 4 && (
                  <div className="tournament-admin-grid">
                    <TournamentAdminField
                      label="Часовой пояс"
                      help="Все даты мастера вводятся в этом локальном времени и сохраняются на сервере без двусмысленности."
                    >
                      <GlassSelect
                        ariaLabel="Часовой пояс"
                        value={draft.timezone}
                        options={[
                          'Europe/Moscow',
                          'Europe/Kaliningrad',
                          'Europe/Samara',
                          'Asia/Yekaterinburg',
                          'Asia/Omsk',
                          'Asia/Krasnoyarsk',
                          'Asia/Irkutsk',
                          'Asia/Yakutsk',
                          'Asia/Vladivostok',
                          'Asia/Magadan',
                          'Asia/Kamchatka',
                          'America/New_York',
                        ].map((timezone) => ({ value: timezone, label: timezone }))}
                        onChange={(timezone) => setDraft({ ...draft, timezone })}
                      />
                    </TournamentAdminField>
                    <TournamentAdminField
                      label="Открытие регистрации"
                      help="С этого момента игроки увидят доступное действие подачи заявки."
                    >
                      <input
                        aria-label="Открытие регистрации"
                        type="datetime-local"
                        value={draft.registrationOpensAt}
                        onChange={(event) =>
                          setDraft({ ...draft, registrationOpensAt: event.target.value })
                        }
                      />
                    </TournamentAdminField>
                    <TournamentAdminField
                      label="Закрытие регистрации"
                      help="После этого момента новые заявки и отмена участия недоступны."
                    >
                      <input
                        aria-label="Закрытие регистрации"
                        type="datetime-local"
                        value={draft.registrationClosesAt}
                        onChange={(event) =>
                          setDraft({ ...draft, registrationClosesAt: event.target.value })
                        }
                      />
                    </TournamentAdminField>
                    <TournamentAdminField
                      label="Старт турнира"
                      help="Дата первого турнирного дня; календарь строится относительно неё."
                    >
                      <input
                        aria-label="Старт турнира"
                        type="datetime-local"
                        value={draft.startsAt}
                        onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })}
                      />
                    </TournamentAdminField>
                  </div>
                )}
                {stage === 5 && (
                  <>
                    <RewardsEditor
                      label="регулярки"
                      value={draft.regularRewards}
                      onChange={(regularRewards) => setDraft({ ...draft, regularRewards })}
                    />
                    <RewardsEditor
                      label="плей-офф"
                      value={draft.playoffRewards}
                      onChange={(playoffRewards) => setDraft({ ...draft, playoffRewards })}
                    />
                  </>
                )}
                {stage === 6 && (
                  <div className="tournament-admin-grid tournament-admin-grid--single">
                    <NotificationEditor
                      reminders={draft.reminderMinutes}
                      overrides={draft.notificationOverrides}
                      onRemindersChange={(reminderMinutes) =>
                        setDraft({ ...draft, reminderMinutes })
                      }
                      onOverridesChange={(notificationOverrides) =>
                        setDraft({ ...draft, notificationOverrides })
                      }
                    />
                    <TournamentAdminField
                      label="Напоминание о дедлайне, минуты"
                      help="За сколько минут до закрытия игрового окна отправить последнее предупреждение."
                    >
                      <input
                        aria-label="Напоминание о дедлайне, минуты"
                        type="number"
                        min="0"
                        max="1440"
                        value={draft.deadlineLeadMinutes}
                        onChange={(event) =>
                          setDraft({ ...draft, deadlineLeadMinutes: Number(event.target.value) })
                        }
                      />
                    </TournamentAdminField>
                    <div className="tournament-admin-note">
                      Если переопределение не задано, используется глобальный push-шаблон.
                      Поддерживаются переменные вида {'{{tournamentTitle}}'}.
                    </div>
                  </div>
                )}
                {stage === 7 && (
                  <div className="tournament-review-card">
                    <strong>{draft.title || 'Без названия'}</strong>
                    <span>
                      {
                        {
                          open: 'Открытая регистрация',
                          approval: 'Заявки с одобрением',
                          invite_only: 'По приглашениям',
                        }[draft.registrationMode]
                      }{' '}
                      · {draft.visibility === 'public' ? 'виден в каталоге' : 'скрытый'}
                    </span>
                    <span>
                      {draft.regularSource === 'head_to_head' ? 'Каждый с каждым' : 'Дневной зачёт'}{' '}
                      · {draft.participantLimit} участников · плей-офф {draft.playoffSize}
                    </span>
                    <span>
                      {draft.timezone} · {draft.startsAt || 'старт не задан'}
                    </span>
                    <span>
                      Создание сохраняет draft. Публикация выполняется отдельным действием с защитой
                      по номеру ревизии.
                    </span>
                  </div>
                )}
              </div>
              <div className="modal-actions">
                <div className="tournament-wizard__save-state" aria-live="polite">
                  {saveState === 'saving' && 'Сохраняем…'}
                  {saveState === 'saved' && 'Сохранено'}
                  {saveState === 'error' && (
                    <>
                      <span>{validationError ?? 'Не удалось сохранить изменения.'}</span>
                      {validationError === null && saveQueue.current !== undefined && (
                        <button
                          type="button"
                          className="admin-compact-btn"
                          onClick={() => saveQueue.current?.retry()}
                        >
                          Повторить сохранение
                        </button>
                      )}
                    </>
                  )}
                </div>
                {stage > 0 && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => setStage(stage - 1)}
                  >
                    Назад
                  </button>
                )}
                {stage < stages.length - 1 ? (
                  <button
                    type="button"
                    className="modal-primary btn btn--cta"
                    disabled={stage === 0 && (draft.title.trim() === '' || create.isPending)}
                    onClick={() => {
                      if (stage === 0 && editingTournament === null) {
                        if (createInFlight.current) return;
                        const body = serializeDraft(draft);
                        createInFlight.current = true;
                        create.mutate({ body, snapshot: JSON.stringify(body) });
                        return;
                      }
                      const next = stage + 1;
                      setStage(next);
                      setMaxStage((current) => Math.max(current, next));
                    }}
                  >
                    Далее
                  </button>
                ) : (
                  <button
                    type="button"
                    className="modal-primary btn btn--cta"
                    disabled={
                      !draft.title.trim() ||
                      create.isPending ||
                      finishing ||
                      saveState === 'error' ||
                      validationError !== null
                    }
                    onClick={() => void finishWizard()}
                  >
                    {finishing ? 'Завершаем…' : 'Готово'}
                  </button>
                )}
              </div>
            </section>
            {confirmClose && (
              <div className="modal-backdrop modal-backdrop--nested" role="presentation">
                <section
                  className="modal-card"
                  role="alertdialog"
                  aria-modal="true"
                  aria-label="Закрыть без сохранения?"
                >
                  <h3 className="modal-title">Закрыть без сохранения?</h3>
                  <p className="modal-copy">Последние изменения могут быть потеряны.</p>
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => setConfirmClose(false)}
                    >
                      Продолжить редактирование
                    </button>
                    <button
                      type="button"
                      className="modal-primary btn btn--cta"
                      onClick={() => closeWizard()}
                    >
                      Закрыть без сохранения
                    </button>
                  </div>
                </section>
              </div>
            )}
          </div>,
          document.body,
        )}
    </section>
  );
}
