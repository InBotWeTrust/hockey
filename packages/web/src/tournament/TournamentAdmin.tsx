import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
  createAdminTournament,
  fetchAdminTournaments,
  updateAdminTournament,
  type AdminTournament,
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
      homeSequence: splitList(round.homeSequence, '-').map((side) => side.toUpperCase()),
      duelTemplateId: round.duelTemplateId || null,
      gameWindowMs: round.gameWindowMinutes * 60_000,
      gameBreakMs: round.gameBreakMinutes * 60_000,
      roundBreakMs: round.roundBreakMinutes * 60_000,
      overtime: { count: round.overtimeCount, shootoutInitialShots: round.shootoutInitialShots },
    }));
  return {
    slug: draft.slug,
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

export function TournamentAdmin(): JSX.Element {
  const client = useQueryClient();
  const tournaments = useQuery({
    queryKey: ['admin', 'tournaments'],
    queryFn: fetchAdminTournaments,
  });
  const [wizardOpen, setWizardOpen] = useState(false);
  const [stage, setStage] = useState(0);
  const [draft, setDraft] = useState(freshDraft);
  const [editingTournament, setEditingTournament] = useState<AdminTournament | null>(null);
  const [selectedTournament, setSelectedTournament] = useState<AdminTournament | null>(null);
  const create = useMutation({
    mutationFn: () => createAdminTournament(serializeDraft(draft)),
    onSuccess: () => {
      setWizardOpen(false);
      setStage(0);
      setDraft(freshDraft());
      void client.invalidateQueries({ queryKey: ['admin', 'tournaments'] });
    },
  });
  const update = useMutation({
    mutationFn: () => {
      const body = Object.fromEntries(
        Object.entries(serializeDraft(draft)).filter(([key]) => key !== 'slug'),
      );
      return updateAdminTournament(editingTournament!.id, editingTournament!.revision, body);
    },
    onSuccess: ({ tournament }) => {
      setWizardOpen(false);
      setStage(0);
      setEditingTournament(null);
      setSelectedTournament(tournament);
      setDraft(freshDraft());
      void client.invalidateQueries({ queryKey: ['admin', 'tournaments'] });
    },
  });
  const updatePlayoffRound = (index: number, patch: Partial<PlayoffRoundDraft>) => {
    setDraft((current) => ({
      ...current,
      playoffRounds: current.playoffRounds.map((round, roundIndex) =>
        roundIndex === index ? { ...round, ...patch } : round,
      ),
    }));
  };

  if (selectedTournament !== null) {
    return (
      <TournamentOperations
        tournament={selectedTournament}
        onBack={() => setSelectedTournament(null)}
        onEdit={() => {
          setEditingTournament(selectedTournament);
          setDraft(draftFromTournament(selectedTournament));
          setStage(0);
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
          className="btn btn--cta"
          onClick={() => {
            setEditingTournament(null);
            setDraft(freshDraft());
            setWizardOpen(true);
          }}
        >
          Создать турнир
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
              className="modal-card"
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
                  onClick={() => {
                    setWizardOpen(false);
                    if (editingTournament !== null) setSelectedTournament(editingTournament);
                    setEditingTournament(null);
                  }}
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
                      Slug
                      <input
                        disabled={editingTournament !== null}
                        value={draft.slug}
                        onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
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
                    <label>
                      Приглашённые user ID, через запятую
                      <textarea
                        value={draft.invitedUserIds}
                        onChange={(event) =>
                          setDraft({ ...draft, invitedUserIds: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Запрещённые user ID, через запятую
                      <textarea
                        value={draft.bannedUserIds}
                        onChange={(event) =>
                          setDraft({ ...draft, bannedUserIds: event.target.value })
                        }
                      />
                    </label>
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
                          <input
                            value={draft.regularDuelTemplateId}
                            onChange={(event) =>
                              setDraft({ ...draft, regularDuelTemplateId: event.target.value })
                            }
                            placeholder="UUID активного шаблона"
                          />
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
                        <label>
                          Критерии равенства, по порядку
                          <input
                            value={draft.tieBreakCriteria}
                            onChange={(event) =>
                              setDraft({ ...draft, tieBreakCriteria: event.target.value })
                            }
                          />
                        </label>
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
                        <label>
                          Очки за места дня, через запятую
                          <input
                            value={draft.dailyPlacePoints}
                            onChange={(event) =>
                              setDraft({ ...draft, dailyPlacePoints: event.target.value })
                            }
                            placeholder="10,8,6,5"
                          />
                        </label>
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
                            <input
                              value={round.duelTemplateId}
                              onChange={(event) =>
                                updatePlayoffRound(index, { duelTemplateId: event.target.value })
                              }
                              placeholder="UUID активного шаблона"
                            />
                          </label>
                          <label>
                            {`Раунд ${index + 1}: порядок площадок`}
                            <input
                              value={round.homeSequence}
                              onChange={(event) =>
                                updatePlayoffRound(index, { homeSequence: event.target.value })
                              }
                            />
                          </label>
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
                      <input
                        value={draft.timezone}
                        onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}
                      />
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
                    <div>Одна строка на место: место, опыт, монеты, звёзды.</div>
                    <label>
                      Награды регулярки
                      <textarea
                        value={draft.regularRewards}
                        onChange={(event) =>
                          setDraft({ ...draft, regularRewards: event.target.value })
                        }
                        placeholder={'1,100,50,3\n2,70,30,2'}
                      />
                    </label>
                    <label>
                      Награды плей-офф
                      <textarea
                        value={draft.playoffRewards}
                        onChange={(event) =>
                          setDraft({ ...draft, playoffRewards: event.target.value })
                        }
                        placeholder={'1,200,100,5\n2,120,60,3'}
                      />
                    </label>
                  </>
                )}
                {stage === 6 && (
                  <>
                    <label>
                      Напоминания до старта, минуты
                      <input
                        value={draft.reminderMinutes}
                        onChange={(event) =>
                          setDraft({ ...draft, reminderMinutes: event.target.value })
                        }
                      />
                    </label>
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
                    <label>
                      Переопределения push-шаблонов
                      <textarea
                        value={draft.notificationOverrides}
                        onChange={(event) =>
                          setDraft({ ...draft, notificationOverrides: event.target.value })
                        }
                        placeholder="event|заголовок|текст|url — по одной строке"
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
                    onClick={() => setStage(stage + 1)}
                  >
                    Далее
                  </button>
                ) : (
                  <button
                    type="button"
                    className="modal-primary btn btn--cta"
                    disabled={!draft.title || !draft.slug || create.isPending || update.isPending}
                    onClick={() => (editingTournament === null ? create.mutate() : update.mutate())}
                  >
                    {editingTournament === null ? 'Сохранить draft' : 'Сохранить изменения'}
                  </button>
                )}
              </div>
            </section>
          </div>,
          document.body,
        )}
    </section>
  );
}
