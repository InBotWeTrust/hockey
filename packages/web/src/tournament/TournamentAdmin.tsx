import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
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

function parseRewards(
  value: string,
): Array<{ place: number; experience: number; coins: number; stars: number }> {
  return value
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [place = '0', experience = '0', coins = '0', stars = '0'] = splitList(line);
      return {
        place: Number(place),
        experience: Number(experience),
        coins: Number(coins),
        stars: Number(stars),
      };
    })
    .filter(
      (reward) =>
        [reward.place, reward.experience, reward.coins, reward.stars].every(Number.isInteger) &&
        reward.place > 0 &&
        reward.experience >= 0 &&
        reward.coins >= 0 &&
        reward.stars >= 0,
    );
}

function parseNotificationOverrides(
  value: string,
): Record<string, { title: string; body: string; url: string }> {
  return Object.fromEntries(
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split('|').map((part) => part.trim()))
      .filter(
        ([key, title, body]) =>
          key?.startsWith('tournament.') === true && Boolean(title) && Boolean(body),
      )
      .map(([key, title, body, url]) => [
        key!,
        { title: title!, body: body!, url: url || '/?view=amateur&section=tournaments' },
      ]),
  );
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
  const rewards = parseRewards(value);
  const update = (
    index: number,
    field: 'place' | 'experience' | 'coins' | 'stars',
    fieldValue: number,
  ) => {
    const next = rewards.map((reward, rewardIndex) =>
      rewardIndex === index ? { ...reward, [field]: fieldValue } : reward,
    );
    onChange(
      next
        .map((reward) => `${reward.place},${reward.experience},${reward.coins},${reward.stars}`)
        .join('\n'),
    );
  };
  return (
    <fieldset className="tournament-structured-editor">
      <legend>Награды {label}</legend>
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
              onChange={(event) => update(index, field, Number(event.target.value))}
            />
          ))}
          <button
            type="button"
            className="admin-compact-btn"
            aria-label={`Удалить награду ${label} ${index + 1}`}
            onClick={() =>
              onChange(
                rewards
                  .filter((_, rewardIndex) => rewardIndex !== index)
                  .map((item) => `${item.place},${item.experience},${item.coins},${item.stars}`)
                  .join('\n'),
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
        onClick={() =>
          onChange(
            [...rewards, { place: rewards.length + 1, experience: 0, coins: 0, stars: 0 }]
              .map((item) => `${item.place},${item.experience},${item.coins},${item.stars}`)
              .join('\n'),
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
  const reminderValues = splitList(reminders).map(Number).filter(Number.isFinite);
  const parsed = parseNotificationOverrides(overrides);
  const selected = Object.keys(parsed);
  const serialize = (next: Record<string, { title: string; body: string; url: string }>) =>
    Object.entries(next)
      .map(([key, item]) => `${key}|${item.title}|${item.body}|${item.url}`)
      .join('\n');
  return (
    <>
      <fieldset className="tournament-structured-editor">
        <legend>Напоминания до старта</legend>
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
        {selected.map((key) => {
          const item = parsed[key]!;
          return (
            <div className="tournament-notification-card" key={key}>
              <strong>{notificationEvents.find(([event]) => event === key)?.[1] ?? key}</strong>
              <label>
                Заголовок
                <input
                  value={item.title}
                  onChange={(event) =>
                    onOverridesChange(
                      serialize({ ...parsed, [key]: { ...item, title: event.target.value } }),
                    )
                  }
                />
              </label>
              <label>
                Текст
                <textarea
                  value={item.body}
                  onChange={(event) =>
                    onOverridesChange(
                      serialize({ ...parsed, [key]: { ...item, body: event.target.value } }),
                    )
                  }
                />
              </label>
              <label>
                Ссылка
                <input
                  value={item.url}
                  onChange={(event) =>
                    onOverridesChange(
                      serialize({ ...parsed, [key]: { ...item, url: event.target.value } }),
                    )
                  }
                />
              </label>
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
        <label>
          Событие
          <select aria-label="Событие уведомления" defaultValue="">
            {' '}
            <option value="" disabled>
              Выберите событие
            </option>
            {notificationEvents
              .filter(([key]) => !selected.includes(key))
              .map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
          </select>
        </label>
        <button
          type="button"
          className="admin-compact-btn"
          onClick={(event) => {
            const select = event.currentTarget.previousElementSibling?.querySelector('select');
            const key = select?.value;
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
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [draft, setDraft] = useState(freshDraft);
  const [editingTournament, setEditingTournament] = useState<AdminTournament | null>(null);
  const [selectedTournament, setSelectedTournament] = useState<AdminTournament | null>(null);
  const lastSavedSnapshot = useRef('');
  const create = useMutation({
    mutationFn: () => createAdminTournament(serializeDraft(draft)),
    onMutate: () => setSaveState('saving'),
    onSuccess: ({ tournament }) => {
      lastSavedSnapshot.current = JSON.stringify(serializeDraft(draft));
      setEditingTournament(tournament);
      setStage(1);
      setMaxStage(1);
      setSaveState('saved');
      void client.invalidateQueries({ queryKey: ['admin', 'tournaments'] });
    },
    onError: () => setSaveState('error'),
  });
  const update = useMutation({
    mutationFn: ({
      body,
      expectedRevision,
    }: {
      body: Record<string, unknown>;
      snapshot: string;
      expectedRevision: number;
    }) => updateAdminTournament(editingTournament!.id, expectedRevision, body),
    onMutate: () => setSaveState('saving'),
    onSuccess: ({ tournament }, variables) => {
      lastSavedSnapshot.current = variables.snapshot;
      setEditingTournament(tournament);
      setSaveState('saved');
      void client.invalidateQueries({ queryKey: ['admin', 'tournaments'] });
    },
    onError: () => setSaveState('error'),
  });
  const saveCurrentDraft = () => {
    if (editingTournament === null) return;
    const body = serializeDraft(draft);
    update.mutate({
      body,
      snapshot: JSON.stringify(body),
      expectedRevision: editingTournament.revision,
    });
  };
  useEffect(() => {
    if (!wizardOpen || editingTournament === null || create.isPending || update.isPending) return;
    let snapshot: string;
    try {
      snapshot = JSON.stringify(serializeDraft(draft));
    } catch {
      setSaveState('error');
      return;
    }
    if (snapshot === lastSavedSnapshot.current) return;
    setSaveState('saving');
    const body = serializeDraft(draft);
    const expectedRevision = editingTournament.revision;
    const timeout = window.setTimeout(
      () => update.mutate({ body, snapshot, expectedRevision }),
      600,
    );
    return () => window.clearTimeout(timeout);
  }, [draft, editingTournament, wizardOpen, create.isPending, update.isPending]);
  const updatePlayoffRound = (index: number, patch: Partial<PlayoffRoundDraft>) => {
    setDraft((current) => ({
      ...current,
      playoffRounds: current.playoffRounds.map((round, roundIndex) =>
        roundIndex === index ? { ...round, ...patch } : round,
      ),
    }));
  };
  const closeWizard = () => {
    setWizardOpen(false);
    setConfirmClose(false);
    if (editingTournament !== null) setSelectedTournament(editingTournament);
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
      currentSnapshot !== lastSavedSnapshot.current
    ) {
      setConfirmClose(true);
      return;
    }
    closeWizard();
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
          lastSavedSnapshot.current = JSON.stringify(serializeDraft(nextDraft));
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
            setEditingTournament(null);
            const nextDraft = freshDraft();
            setDraft(nextDraft);
            lastSavedSnapshot.current = JSON.stringify(serializeDraft(nextDraft));
            setStage(0);
            setMaxStage(0);
            setSaveState('idle');
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
              style={{ maxHeight: '90dvh', overflowY: 'auto' }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
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
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
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
              <div className="modal-copy" style={{ display: 'grid', gap: 10 }}>
                {stage === 0 && (
                  <>
                    <label>
                      Название
                      <input
                        value={draft.title}
                        onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                      />
                    </label>
                    <label>
                      Описание
                      <textarea
                        value={draft.description}
                        onChange={(event) =>
                          setDraft({ ...draft, description: event.target.value })
                        }
                      />
                    </label>
                  </>
                )}
                {stage === 1 && (
                  <>
                    <label>
                      Регистрация
                      <select
                        value={draft.registrationMode}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            registrationMode: event.target.value as RegistrationMode,
                          })
                        }
                      >
                        <option value="open">Открытая</option>
                        <option value="approval">С одобрением</option>
                        <option value="invite_only">Только по приглашению</option>
                      </select>
                    </label>
                    <label>
                      Видимость
                      <select
                        value={draft.visibility}
                        onChange={(event) =>
                          setDraft({ ...draft, visibility: event.target.value as Visibility })
                        }
                      >
                        <option value="public">Публичный</option>
                        <option value="hidden">Скрытый</option>
                      </select>
                    </label>
                    <label>
                      Вступительный взнос, монеты
                      <input
                        type="number"
                        min="0"
                        value={draft.entryFeeCoins}
                        onChange={(event) =>
                          setDraft({ ...draft, entryFeeCoins: Number(event.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Минимальный уровень
                      <input
                        type="number"
                        min="1"
                        value={draft.minLevel}
                        onChange={(event) => setDraft({ ...draft, minLevel: event.target.value })}
                      />
                    </label>
                    <label>
                      Максимальный уровень
                      <input
                        type="number"
                        min="1"
                        value={draft.maxLevel}
                        onChange={(event) => setDraft({ ...draft, maxLevel: event.target.value })}
                      />
                    </label>
                    <label>
                      Минимум голов
                      <input
                        type="number"
                        min="0"
                        value={draft.minGoals}
                        onChange={(event) =>
                          setDraft({ ...draft, minGoals: Number(event.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Минимум опыта
                      <input
                        type="number"
                        min="0"
                        value={draft.minExperience}
                        onChange={(event) =>
                          setDraft({ ...draft, minExperience: Number(event.target.value) })
                        }
                      />
                    </label>
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
                  </>
                )}
                {stage === 2 && (
                  <>
                    <label>
                      Формат
                      <select
                        value={draft.regularSource}
                        onChange={(event) =>
                          setDraft({ ...draft, regularSource: event.target.value as RegularSource })
                        }
                      >
                        <option value="head_to_head">Каждый с каждым</option>
                        <option value="daily_aggregate">Daily aggregate</option>
                      </select>
                    </label>
                    <label>
                      Участников
                      <input
                        type="number"
                        min="2"
                        max={draft.regularSource === 'head_to_head' ? 64 : 10_000}
                        value={draft.participantLimit}
                        onChange={(event) =>
                          setDraft({ ...draft, participantLimit: Number(event.target.value) })
                        }
                      />
                    </label>
                    {draft.regularSource === 'head_to_head' ? (
                      <>
                        <label>
                          Кругов
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={draft.roundRobinCycles}
                            onChange={(event) =>
                              setDraft({ ...draft, roundRobinCycles: Number(event.target.value) })
                            }
                          />
                        </label>
                        <label>
                          Туров в день
                          <input
                            type="number"
                            min="1"
                            max="24"
                            value={draft.roundsPerDay}
                            onChange={(event) =>
                              setDraft({ ...draft, roundsPerDay: Number(event.target.value) })
                            }
                          />
                        </label>
                        <label>
                          Первый тур дня
                          <input
                            type="time"
                            value={draft.firstRoundLocalTime}
                            onChange={(event) =>
                              setDraft({ ...draft, firstRoundLocalTime: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          Окно игры, минуты
                          <input
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
                        </label>
                        <label>
                          Пауза между турами, минуты
                          <input
                            type="number"
                            min="0"
                            value={draft.roundBreakMinutes}
                            onChange={(event) =>
                              setDraft({ ...draft, roundBreakMinutes: Number(event.target.value) })
                            }
                          />
                        </label>
                        <label>
                          Шаблон дуэли регулярки
                          <select
                            aria-label="Шаблон дуэли регулярки"
                            value={draft.regularDuelTemplateId}
                            onChange={(event) =>
                              setDraft({ ...draft, regularDuelTemplateId: event.target.value })
                            }
                          >
                            <option value="">Выберите шаблон</option>
                            {(duelTemplates.data?.templates ?? [])
                              .filter(
                                (template) =>
                                  template.isActive || template.id === draft.regularDuelTemplateId,
                              )
                              .map((template) => (
                                <option key={template.id} value={template.id}>
                                  {template.title} · {template.totalPeriods} пер. ·{' '}
                                  {template.shotsPerPeriod} бросков
                                  {!template.isActive ? ' · архивный' : ''}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          Очки: победа в основное время
                          <input
                            type="number"
                            value={draft.regulationWin}
                            onChange={(event) =>
                              setDraft({ ...draft, regulationWin: Number(event.target.value) })
                            }
                          />
                        </label>
                        <label>
                          Очки: победа в овертайме
                          <input
                            type="number"
                            value={draft.overtimeWin}
                            onChange={(event) =>
                              setDraft({ ...draft, overtimeWin: Number(event.target.value) })
                            }
                          />
                        </label>
                        <label>
                          Очки: поражение в овертайме
                          <input
                            type="number"
                            value={draft.overtimeLoss}
                            onChange={(event) =>
                              setDraft({ ...draft, overtimeLoss: Number(event.target.value) })
                            }
                          />
                        </label>
                        <label>
                          Очки: ничья
                          <input
                            type="number"
                            value={draft.draw}
                            onChange={(event) =>
                              setDraft({ ...draft, draw: Number(event.target.value) })
                            }
                          />
                        </label>
                        <label>
                          Очки: поражение
                          <input
                            type="number"
                            value={draft.loss}
                            onChange={(event) =>
                              setDraft({ ...draft, loss: Number(event.target.value) })
                            }
                          />
                        </label>
                        <label>
                          Очки: техническое поражение
                          <input
                            type="number"
                            value={draft.technicalLoss}
                            onChange={(event) =>
                              setDraft({ ...draft, technicalLoss: Number(event.target.value) })
                            }
                          />
                        </label>
                        <TieBreakEditor
                          value={draft.tieBreakCriteria}
                          onChange={(tieBreakCriteria) => setDraft({ ...draft, tieBreakCriteria })}
                        />
                      </>
                    ) : (
                      <>
                        <label>
                          Дней регулярки
                          <input
                            type="number"
                            min="1"
                            max="366"
                            value={draft.dailyDays}
                            onChange={(event) =>
                              setDraft({ ...draft, dailyDays: Number(event.target.value) })
                            }
                          />
                        </label>
                        <label>
                          Метрика дня
                          <select
                            value={draft.dailyMetric}
                            onChange={(event) =>
                              setDraft({ ...draft, dailyMetric: event.target.value as DailyMetric })
                            }
                          >
                            <option value="goals_sum">Сумма голов</option>
                            <option value="accuracy_average">Средняя точность</option>
                            <option value="daily_place_points">Очки за место</option>
                          </select>
                        </label>
                        <label>
                          Учитывать лучшие N дней
                          <input
                            type="number"
                            min="1"
                            value={draft.bestDays}
                            onChange={(event) =>
                              setDraft({ ...draft, bestDays: event.target.value })
                            }
                            placeholder="Пусто — все дни"
                          />
                        </label>
                        <DailyPlacePointsEditor
                          value={draft.dailyPlacePoints}
                          onChange={(dailyPlacePoints) => setDraft({ ...draft, dailyPlacePoints })}
                        />
                      </>
                    )}
                  </>
                )}
                {stage === 3 && (
                  <>
                    <label>
                      Размер плей-офф
                      <select
                        value={draft.playoffSize}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            playoffSize: Number(event.target.value) as PlayoffSize,
                          })
                        }
                      >
                        {[2, 4, 8, 16].map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </label>
                    {draft.playoffRounds
                      .slice(0, playoffRoundCount(draft.playoffSize))
                      .map((round, index) => (
                        <fieldset
                          key={index}
                          style={{
                            display: 'grid',
                            gap: 8,
                            border: '1px solid rgba(79, 101, 130, .2)',
                            borderRadius: 16,
                            padding: 12,
                          }}
                        >
                          <legend>Раунд {index + 1}</legend>
                          <label>
                            {`Раунд ${index + 1}: побед для серии`}
                            <input
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
                          </label>
                          <label>
                            {`Раунд ${index + 1}: шаблон дуэли`}
                            <select
                              value={round.duelTemplateId}
                              onChange={(event) =>
                                updatePlayoffRound(index, { duelTemplateId: event.target.value })
                              }
                            >
                              <option value="">Выберите шаблон</option>
                              {(duelTemplates.data?.templates ?? [])
                                .filter(
                                  (template) =>
                                    template.isActive || template.id === round.duelTemplateId,
                                )
                                .map((template) => (
                                  <option key={template.id} value={template.id}>
                                    {template.title}
                                    {!template.isActive ? ' · архивный' : ''}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <HomeSequenceEditor
                            roundNumber={index + 1}
                            winsRequired={round.winsRequired}
                            value={round.homeSequence}
                            onChange={(homeSequence) => updatePlayoffRound(index, { homeSequence })}
                          />
                          <label>
                            {`Раунд ${index + 1}: окно игры, минуты`}
                            <input
                              type="number"
                              min="1"
                              value={round.gameWindowMinutes}
                              onChange={(event) =>
                                updatePlayoffRound(index, {
                                  gameWindowMinutes: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                          <label>
                            {`Раунд ${index + 1}: пауза игр, минуты`}
                            <input
                              type="number"
                              min="0"
                              value={round.gameBreakMinutes}
                              onChange={(event) =>
                                updatePlayoffRound(index, {
                                  gameBreakMinutes: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                          <label>
                            {`Раунд ${index + 1}: пауза раундов, минуты`}
                            <input
                              type="number"
                              min="0"
                              value={round.roundBreakMinutes}
                              onChange={(event) =>
                                updatePlayoffRound(index, {
                                  roundBreakMinutes: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                          <label>
                            {`Раунд ${index + 1}: овертаймов`}
                            <input
                              type="number"
                              min="0"
                              value={round.overtimeCount}
                              onChange={(event) =>
                                updatePlayoffRound(index, {
                                  overtimeCount: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                          <label>
                            {`Раунд ${index + 1}: бросков в буллитах`}
                            <input
                              type="number"
                              min="1"
                              value={round.shootoutInitialShots}
                              onChange={(event) =>
                                updatePlayoffRound(index, {
                                  shootoutInitialShots: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                        </fieldset>
                      ))}
                  </>
                )}
                {stage === 4 && (
                  <>
                    <label>
                      Часовой пояс
                      <select
                        value={draft.timezone}
                        onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}
                      >
                        {[
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
                        ].map((timezone) => (
                          <option key={timezone} value={timezone}>
                            {timezone}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Открытие регистрации
                      <input
                        type="datetime-local"
                        value={draft.registrationOpensAt}
                        onChange={(event) =>
                          setDraft({ ...draft, registrationOpensAt: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Закрытие регистрации
                      <input
                        type="datetime-local"
                        value={draft.registrationClosesAt}
                        onChange={(event) =>
                          setDraft({ ...draft, registrationClosesAt: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Старт турнира
                      <input
                        type="datetime-local"
                        value={draft.startsAt}
                        onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })}
                      />
                    </label>
                  </>
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
                  <>
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
                    <label>
                      Напоминание о дедлайне, минуты
                      <input
                        type="number"
                        min="0"
                        max="1440"
                        value={draft.deadlineLeadMinutes}
                        onChange={(event) =>
                          setDraft({ ...draft, deadlineLeadMinutes: Number(event.target.value) })
                        }
                      />
                    </label>
                    <div>
                      Если переопределение не задано, используется глобальный push-шаблон.
                      Поддерживаются переменные вида {'{{tournamentTitle}}'}.
                    </div>
                  </>
                )}
                {stage === 7 && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <strong>{draft.title || 'Без названия'}</strong>
                    <span>
                      {draft.registrationMode} · {draft.visibility}
                    </span>
                    <span>
                      {draft.regularSource} · {draft.participantLimit} участников · плей-офф{' '}
                      {draft.playoffSize}
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
                <span className="tournament-wizard__save-state" aria-live="polite">
                  {saveState === 'saving' && 'Сохраняем…'}
                  {saveState === 'saved' && 'Сохранено'}
                  {saveState === 'error' &&
                    'Не удалось сохранить. Возможно, черновик изменён в другой вкладке — обновите данные.'}
                </span>
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
                    disabled={stage === 0 && draft.title.trim() === ''}
                    onClick={() => {
                      if (stage === 0 && editingTournament === null) {
                        create.mutate();
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
                      !draft.title ||
                      create.isPending ||
                      update.isPending ||
                      saveState === 'saving' ||
                      saveState === 'error'
                    }
                    onClick={() =>
                      editingTournament === null ? create.mutate() : saveCurrentDraft()
                    }
                  >
                    {editingTournament === null ? 'Сохранить draft' : 'Сохранить изменения'}
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
                      onClick={closeWizard}
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
