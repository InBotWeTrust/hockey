import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import {
  applyToTournament,
  fetchTournamentSchedule,
  fetchTournamentScheduleOtherGames,
  fetchTournamentStandings,
  fetchTournamentBracket,
  fetchTournaments,
  fetchTournamentParticipants,
  openTournamentFixtureSegment,
  withdrawFromTournament,
  type TournamentFixture,
  type TournamentScheduleDay,
  type TournamentScheduleCursor,
  type TournamentSummary,
} from '../api/tournament.js';
import { useAuthStore } from '../auth/authStore.js';
import { VenueBadge, type VenueRole } from '../components/VenueBadge.js';
import { SegmentedTabs } from '../components/SegmentedTabs.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { UserAvatar } from '../chat/components/UserAvatar.js';
import { tournamentStatusLabel } from './labels.js';
import { tournamentTimezoneLabel } from './timezoneLabel.js';
import { TournamentStandingsTable } from './TournamentStandingsTable.js';
import { TournamentScheduleCalendar } from './TournamentScheduleCalendar.js';
import { TournamentPlayoffBracket } from './TournamentPlayoffBracket.js';
import { TournamentMatchdayResults } from './TournamentMatchdayResults.js';

type TournamentTab = 'standings' | 'schedule' | 'playoff' | 'rules';

const activeTournamentTabs: Array<{ key: TournamentTab; label: string }> = [
  { key: 'standings', label: 'Таблица' },
  { key: 'schedule', label: 'Расписание' },
  { key: 'playoff', label: 'Плей-офф' },
  { key: 'rules', label: 'Правила' },
];

function tournamentHasStarted(startsAt: string | null, now: number): boolean {
  if (startsAt === null) return false;
  const timestamp = new Date(startsAt).getTime();
  return Number.isFinite(timestamp) && timestamp <= now;
}

export function tournamentTabs(
  startsAt: string | null,
  now = Date.now(),
): Array<{ key: TournamentTab; label: string }> {
  if (tournamentHasStarted(startsAt, now)) return activeTournamentTabs;
  const rules = activeTournamentTabs.find((tab) => tab.key === 'rules')!;
  return [rules, ...activeTournamentTabs.filter((tab) => tab.key !== 'rules')];
}

export function tournamentInitialTab(
  search: string,
  startsAt: string | null,
  now = Date.now(),
): TournamentTab {
  const requested = new URLSearchParams(search).get('tab');
  if (requested === 'overview') return 'rules';
  if (activeTournamentTabs.some((tab) => tab.key === requested)) return requested as TournamentTab;
  return tournamentHasStarted(startsAt, now) ? 'standings' : 'rules';
}

function fixtureVenueRole(fixture: TournamentFixture, currentUserId: string | null): VenueRole {
  if (fixture.venueMode === 'neutral_default') return 'neutral';
  return fixture.away?.userId === currentUserId ? 'away' : 'home';
}

function statusLabel(status: TournamentSummary['status']): string {
  return tournamentStatusLabel(status);
}

function participantStateLabel(state: string | null): string {
  if (state === null) return 'Вы ещё не заявлены';
  const labels: Record<string, string> = {
    invited: 'Вас пригласили',
    applied: 'Заявка подана',
    approved: 'Вы участвуете',
    rejected: 'Заявка отклонена',
    declined: 'Приглашение отклонено',
    withdrawn: 'Вы снялись с турнира',
    removed: 'Участие отменено администратором',
    disqualified: 'Дисквалификация',
  };
  return labels[state] ?? 'Статус участия уточняется';
}

function participationLabel(tournament: TournamentSummary): string {
  if (tournament.status === 'completed') {
    return tournament.myFinalPlace == null
      ? 'Турнир завершён'
      : `Ваше место: ${tournament.myFinalPlace}`;
  }
  if (tournament.status === 'registration' && tournament.myParticipantState === 'approved') {
    return 'Заявка принята';
  }
  if (
    tournament.myParticipantState === 'approved' &&
    tournament.lifecycle.action === 'await_manual_regular_start'
  ) {
    return 'Заявка подтверждена';
  }
  return participantStateLabel(tournament.myParticipantState);
}

function fixtureStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    conditional: 'Соперники определятся позже',
    scheduled: 'Запланирована',
    open: 'Можно начинать игру',
    active: 'Идёт игра',
    completed: 'Завершена',
    settled: 'Завершена',
    cancelled: 'Отменена',
    technical: 'Технический результат',
    forfeit: 'Технический результат',
    blocked: 'Ожидает решения',
    paused: 'Ожидает решения',
  };
  return labels[status] ?? 'Статус уточняется';
}

function fixtureHasResult(fixture: TournamentFixture): boolean {
  return (
    ['completed', 'settled', 'forfeit', 'technical'].includes(fixture.status) ||
    fixture.winnerUserId != null
  );
}

export function fixtureCanOpen(fixture: TournamentFixture, now = Date.now()): boolean {
  if (fixtureHasResult(fixture)) return false;
  if (fixture.status === 'open' || fixture.status === 'active') return true;
  if (fixture.status !== 'scheduled' || fixture.scheduledStartsAt === null) return false;
  const startsAt = new Date(fixture.scheduledStartsAt).getTime();
  const endsAt =
    fixture.windowEndsAt === null
      ? Number.POSITIVE_INFINITY
      : new Date(fixture.windowEndsAt).getTime();
  return Number.isFinite(startsAt) && startsAt <= now && now < endsAt;
}

function fixtureTimeLabel(fixture: TournamentFixture, timezone: string, finished: boolean): string {
  if (!finished) return 'Время игры появится после предыдущего результата';
  const displayValue = fixture.actualStartsAt ?? fixture.scheduledStartsAt;
  if (displayValue === null || displayValue === undefined) return 'Время ещё не назначено';
  const startsAt = new Date(displayValue);
  if (!Number.isFinite(startsAt.getTime())) return 'Время ещё не назначено';
  try {
    const formatter = new Intl.DateTimeFormat('ru-RU', {
      timeZone: timezone,
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
    return formatter.format(startsAt).replace(/ в /, ', ');
  } catch {
    return startsAt.toLocaleString('ru-RU');
  }
}

function fixtureWinnerUserId(fixture: TournamentFixture): string | null {
  if (fixture.winnerUserId !== undefined) return fixture.winnerUserId;
  if (fixture.score.home === fixture.score.away) return null;
  return fixture.score.home > fixture.score.away
    ? (fixture.home?.userId ?? null)
    : (fixture.away?.userId ?? null);
}

function fixtureTechnicalResultLabel(fixture: TournamentFixture): string | null {
  if (fixture.technicalResult !== true) return null;
  const winnerUserId = fixtureWinnerUserId(fixture);
  const winnerName =
    winnerUserId === fixture.home?.userId
      ? fixture.home.name
      : winnerUserId === fixture.away?.userId
        ? fixture.away.name
        : null;
  return winnerName ? `Техническая победа — ${winnerName}` : 'Технический результат';
}

function myFixtureResultLabel(
  fixture: TournamentFixture,
  currentUserId: string | null,
): 'Победа' | 'Поражение' | null {
  if (currentUserId === null) return null;
  const winnerUserId = fixtureWinnerUserId(fixture);
  if (winnerUserId === null) return null;
  return winnerUserId === currentUserId ? 'Победа' : 'Поражение';
}

function localDateKey(value: string | number, timezone: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return new Date().toISOString().slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

type ScheduleDateTournament = Pick<
  TournamentSummary,
  'startsAt' | 'completedAt' | 'projectedEndsAt' | 'rules'
>;

function initialScheduleDate(tournament: ScheduleDateTournament): string {
  const timezone = String(tournament.rules.config.timezone ?? 'Europe/Moscow');
  const today = localDateKey(Date.now(), timezone);
  const starts = tournament.startsAt === null ? today : localDateKey(tournament.startsAt, timezone);
  const endsValue = tournament.completedAt ?? tournament.projectedEndsAt;
  const ends =
    endsValue === null || endsValue === undefined ? today : localDateKey(endsValue, timezone);
  if (today < starts) return starts;
  if (today > ends) return ends;
  return today;
}

export function scheduleDateForTabChange(
  nextTab: TournamentTab,
  tournament: ScheduleDateTournament,
  currentDate: string,
): string {
  return nextTab === 'schedule' ? initialScheduleDate(tournament) : currentDate;
}

export function scheduleDateAfterDaysLoad(
  currentDate: string,
  days: TournamentScheduleDay[],
  timezone: string,
  manuallySelected: boolean,
): string {
  if (manuallySelected) return currentDate;
  const today = localDateKey(Date.now(), timezone);
  return days.some((day) => day.localDate === today) ? today : currentDate;
}

function fixturePlayerLabel(participant: TournamentFixture['home'], showSeed: boolean): string {
  const name = participant?.name ?? 'Участник';
  return showSeed && participant?.seed != null ? `(${participant.seed}) ${name}` : name;
}

function registrationWindow(
  tournament: TournamentSummary,
  now = new Date(),
): {
  isOpen: boolean;
  label: string;
  actionLabel: string;
  timingLabel: string | null;
  hideAction: boolean;
} {
  if (tournament.lifecycle.action === 'registration_waiting') {
    return {
      isOpen: false,
      label: 'Ждём открытия регистрации',
      timingLabel:
        tournament.lifecycle.dueAt === null
          ? 'Регистрация откроется позже'
          : `Регистрация откроется ${tournamentLifecycleDateLabel(tournament.lifecycle.dueAt)}`,
      actionLabel: 'Регистрация ещё не открыта',
      hideAction: true,
    };
  }
  if (tournament.lifecycle.action === 'registration_open') {
    return {
      isOpen: true,
      label: 'Идёт регистрация',
      timingLabel:
        tournament.lifecycle.dueAt === null
          ? null
          : `Заявки принимаются до ${tournamentLifecycleDateLabel(tournament.lifecycle.dueAt)}`,
      actionLabel: '',
      hideAction: false,
    };
  }
  if (tournament.status !== 'registration') {
    const lifecycle: Record<string, { label: string; timingLabel: string | null }> = {
      registration_blocked: {
        label: 'Регистрация завершена',
        timingLabel: 'Организаторы проверяют состав участников',
      },
      scheduling: { label: 'Регистрация завершена', timingLabel: 'Готовим расписание' },
      regular: { label: 'Турнир идёт', timingLabel: 'Следите за календарём и результатами' },
      playoff: { label: 'Идёт плей-офф', timingLabel: 'Следите за сеткой и следующими играми' },
      paused: { label: 'Турнир на паузе', timingLabel: 'О продолжении сообщат организаторы' },
      completed: { label: 'Турнир завершён', timingLabel: null },
      cancelled: { label: 'Турнир отменён', timingLabel: null },
    };
    const copy = lifecycle[tournament.status] ?? {
      label: statusLabel(tournament.status),
      timingLabel: null,
    };
    return { isOpen: false, ...copy, actionLabel: '', hideAction: true };
  }
  const opensAt =
    tournament.registrationOpensAt === null ? null : new Date(tournament.registrationOpensAt);
  const closesAt =
    tournament.registrationClosesAt === null ? null : new Date(tournament.registrationClosesAt);
  if (opensAt !== null && Number.isFinite(opensAt.getTime()) && now < opensAt) {
    return {
      isOpen: false,
      label: 'Ждём открытия регистрации',
      timingLabel: `Регистрация откроется ${opensAt.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })}`,
      actionLabel: 'Регистрация ещё не открыта',
      hideAction: false,
    };
  }
  if (closesAt !== null && Number.isFinite(closesAt.getTime()) && now >= closesAt) {
    return {
      isOpen: false,
      label: 'Регистрация завершена',
      timingLabel: 'Готовим расписание',
      actionLabel: 'Регистрация завершена',
      hideAction: true,
    };
  }
  return {
    isOpen: true,
    label: 'Идёт регистрация',
    timingLabel:
      closesAt !== null && Number.isFinite(closesAt.getTime())
        ? `Заявки принимаются до ${closesAt.toLocaleString('ru-RU', {
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
          })}`
        : null,
    actionLabel: '',
    hideAction: false,
  };
}

function tournamentLifecycleDateLabel(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'позже';
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('day')} ${part('month')} в ${part('hour')}:${part('minute')} мск`;
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function tournamentPlayoffStartsAt(tournament: TournamentSummary): string[] {
  if (!Array.isArray(tournament.rules.playoffRounds)) return [];
  return tournament.rules.playoffRounds.flatMap((value) => {
    const startsAt = objectValue(value).firstGameStartsAt;
    return typeof startsAt === 'string' && startsAt.length > 0 ? [startsAt] : [];
  });
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function tournamentDateLabel(
  value: string | null | undefined,
  timezone: string,
  withZone = true,
): string {
  if (!value) return 'Дата пока не назначена';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Дата пока не назначена';
  try {
    const formatted = new Intl.DateTimeFormat('ru-RU', {
      timeZone: timezone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
    return withZone ? `${formatted} (${tournamentTimezoneLabel(timezone)})` : formatted;
  } catch {
    return date.toLocaleString('ru-RU');
  }
}

function importantTournamentDate(tournament: TournamentSummary): string | null {
  const timezone = String(tournament.rules.config.timezone ?? 'Europe/Moscow');
  if (
    ['registration', 'registration_blocked'].includes(tournament.status) &&
    tournament.registrationClosesAt
  ) {
    return `Заявки до ${tournamentDateLabel(tournament.registrationClosesAt, timezone, false)}`;
  }
  if (tournament.startsAt) {
    return `Старт ${tournamentDateLabel(tournament.startsAt, timezone, false)}`;
  }
  return null;
}

function pluralRu(value: number, one: string, few: string, many: string): string {
  const lastTwo = Math.abs(value) % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  const last = Math.abs(value) % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function rewardLabel(value: unknown): string | null {
  const reward = objectValue(value);
  const place = numberValue(reward.place);
  if (place < 1) return null;
  const stars = numberValue(reward.stars);
  const lastTwo = stars % 100;
  const starWord =
    lastTwo >= 11 && lastTwo <= 14
      ? 'звёзд'
      : stars % 10 === 1
        ? 'звезда'
        : stars % 10 >= 2 && stars % 10 <= 4
          ? 'звезды'
          : 'звёзд';
  return `${place} место — ${numberValue(reward.experience)} опыта, ${numberValue(reward.coins)} монет, ${stars} ${starWord}`;
}

function humanList(values: string[]): string {
  if (values.length <= 1) return values[0] ?? '';
  return `${values.slice(0, -1).join(', ')} и ${values.at(-1)}`;
}

function tieBreakSentence(criteria: unknown): string {
  const labels: Record<string, string> = {
    points: 'очкам',
    wins: 'количеству побед',
    goal_difference: 'разнице шайб',
    goals_for: 'количеству забитых шайб',
  };
  const values = Array.isArray(criteria)
    ? criteria.map(String).map((criterion) => labels[criterion] ?? 'дополнительному правилу')
    : ['очкам'];
  if (values.length <= 1) {
    return `Если несколько игроков окажутся вровень, места определятся по ${values[0] ?? 'очкам'}.`;
  }
  return `Если несколько игроков окажутся вровень, места определятся сначала по ${values[0]}, затем по ${humanList(values.slice(1))}.`;
}

function homeSequenceSentence(value: unknown): string {
  const sequence = Array.isArray(value) ? value.map(String) : [];
  if (
    sequence.length >= 4 &&
    sequence[0] === 'H' &&
    sequence[1] === 'H' &&
    sequence[2] === 'A' &&
    sequence[3] === 'A'
  ) {
    const tail = sequence.slice(4).map((side) => (side === 'H' ? 'дома' : 'в гостях'));
    return tail.length > 0
      ? `Первые две игры — дома, следующие две — в гостях. Затем площадки чередуются: ${tail.join(', ')}.`
      : 'Первые две игры — дома, следующие две — в гостях.';
  }
  const readable = sequence.map((side) => (side === 'H' ? 'дома' : 'в гостях'));
  return readable.length > 0
    ? `Игры проходят на площадках по очереди: ${humanList(readable)}.`
    : 'Порядок домашних и гостевых игр объявят вместе с расписанием.';
}

function playoffRoundTitle(roundNumber: number): string {
  return (
    {
      1: 'Первый раунд',
      2: 'Второй раунд',
      3: 'Третий раунд',
      4: 'Финальный раунд',
    }[roundNumber] ?? `Раунд ${roundNumber}`
  );
}

function playoffFormatLabel(kind: 'express' | 'express_plus' | 'classic'): string {
  if (kind === 'express') return 'Экспресс';
  if (kind === 'express_plus') return 'Микс';
  return 'Классика';
}

function TournamentRules({ tournament }: { tournament: TournamentSummary }): JSX.Element {
  const config = objectValue(tournament.rules.config);
  const playoffRounds = Array.isArray(tournament.rules.playoffRounds)
    ? tournament.rules.playoffRounds
    : [];
  const stageRewards = objectValue(tournament.rules.stageRewards);
  const regularRewards = Array.isArray(stageRewards.regular) ? stageRewards.regular : [];
  const playoffRewards = Array.isArray(stageRewards.playoff) ? stageRewards.playoff : [];
  const regularSource = config.regularSource ?? tournament.regularSource;
  const cycles = numberValue(config.roundRobinCycles, 1);
  const roundsPerDay = numberValue(config.roundsPerDay, 1);
  const dailyMetricLabels: Record<string, string> = {
    goals_sum: 'по количеству голов',
    accuracy_average: 'по средней точности',
    daily_place_points: 'по очкам за место',
  };
  const classicRules = objectValue(config.classicRules);
  const classicIncompleteLabels: Record<string, string> = {
    completed_game: 'в таблицу попадут только полностью завершённые игры',
    completed_periods: 'в таблицу попадут завершённые периоды',
    all_shots: 'в таблицу попадут все сделанные броски',
  };
  const classicSpeedDescription = Array.isArray(classicRules.periodSpeedPresets)
    ? classicRules.periodSpeedPresets
        .map((value, index) => {
          const preset = objectValue(value);
          return `${index + 1}-й период: ворота ${String(preset.goalFrequency ?? '—')}, вратарь ${String(preset.goalieFrequency ?? '—')}, игрок ${String(preset.shooterFrequency ?? '—')}, шайба ${String(preset.puckSpeedPerMs ?? '—')}`;
        })
        .join('; ')
    : '';
  const aggregateDescription = `Турнир продлится ${numberValue(config.dailyDays)} ${pluralRu(numberValue(config.dailyDays), 'день', 'дня', 'дней')}. Результат каждого дня определяется ${dailyMetricLabels[String(config.dailyMetric ?? 'goals_sum')] ?? 'по количеству голов'}. ${config.bestDays === null || config.bestDays === undefined ? 'В итог войдут результаты всех дней.' : `В итог войдут лучшие ${String(config.bestDays)} ${pluralRu(numberValue(config.bestDays), 'день', 'дня', 'дней')}.`}`;
  const regularDescription =
    regularSource === 'daily_aggregate'
      ? aggregateDescription
      : regularSource === 'classic'
        ? `${aggregateDescription} В каждом туре — отдельная игра «Классика»: 3 периода по ${numberValue(classicRules.shotsPerPeriod)} ${pluralRu(numberValue(classicRules.shotsPerPeriod), 'броску', 'броска', 'бросков')}, по ${numberValue(classicRules.periodDurationMs) / 60_000} мин. Перерыв — ${numberValue(classicRules.breakDurationMs) / 60_000} мин. Если игру не закончить, ${classicIncompleteLabels[String(classicRules.incompleteResultPolicy ?? 'completed_game')] ?? classicIncompleteLabels.completed_game}. ${classicSpeedDescription.length > 0 ? `Скорости: ${classicSpeedDescription}.` : ''}`
        : `Каждый сыграет с каждым ${cycles === 1 ? 'один раз' : `${cycles} ${pluralRu(cycles, 'раз', 'раза', 'раз')}`}. Каждый день ${roundsPerDay === 1 ? 'проходит один тур' : `проходит ${roundsPerDay} ${pluralRu(roundsPerDay, 'тур', 'тура', 'туров')}`}. Первый тур начнётся ${tournamentDateLabel(tournament.startsAt, String(config.timezone ?? 'Europe/Moscow'))}.`;

  return (
    <div className="tournament-rules">
      <section className="tournament-rules__section">
        <h3>Регулярный чемпионат</h3>
        <p>{regularDescription}</p>
        <p>{tieBreakSentence(tournament.rules.tieBreakCriteria)}</p>
      </section>
      <section className="tournament-rules__section">
        <h3>Плей-офф</h3>
        <div className="tournament-rules__rounds">
          {playoffRounds.map((value, index) => {
            const round = objectValue(value);
            const roundNumber = numberValue(round.roundNumber, index + 1);
            const winsRequired = numberValue(round.winsRequired, 1);
            const format = tournament.playoffFormats?.find(
              (candidate) => candidate.roundNumber === roundNumber,
            );
            return (
              <article className="tournament-rules__round" key={String(round.roundNumber ?? index)}>
                <h4>{playoffRoundTitle(roundNumber)}</h4>
                <p>
                  Серия идёт до {winsRequired} {pluralRu(winsRequired, 'победы', 'побед', 'побед')}.
                </p>
                <p>
                  Формат игры:{' '}
                  {format === undefined
                    ? 'будет объявлен перед стартом'
                    : playoffFormatLabel(format.duelKind)}
                  .
                </p>
                <p>{homeSequenceSentence(round.homeSequence)}</p>
              </article>
            );
          })}
        </div>
      </section>
      <section className="tournament-rules__section">
        <h3>Призы за регулярный чемпионат</h3>
        {regularRewards
          .map(rewardLabel)
          .filter((label): label is string => label !== null)
          .map((label) => (
            <p key={label}>{label}</p>
          ))}
        {regularRewards.length === 0 && <p>Призы пока не назначены.</p>}
      </section>
      <section className="tournament-rules__section">
        <h3>Призы за плей-офф</h3>
        {playoffRewards
          .map(rewardLabel)
          .filter((label): label is string => label !== null)
          .map((label) => (
            <p key={label}>{label}</p>
          ))}
        {playoffRewards.length === 0 && <p>Призы пока не назначены.</p>}
      </section>
    </div>
  );
}

function TournamentDetails({ tournament }: { tournament: TournamentSummary }) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const [tab, setTab] = useState<TournamentTab>(() =>
    tournamentInitialTab(location.search, tournament.startsAt),
  );
  const visibleTabs = tournamentTabs(tournament.startsAt);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(() => initialScheduleDate(tournament));
  const scheduleDateManuallySelected = useRef(false);
  const activeFixtureId = useRef<string | null>(null);
  const fixtureOpeningRef = useRef(false);
  const openFixtureGeneration = useRef(0);
  const queryClient = useQueryClient();
  const registrationState = registrationWindow(tournament);
  const schedule = useQuery({
    queryKey: ['tournaments', tournament.id, 'schedule', scheduleDate],
    queryFn: () => fetchTournamentSchedule(tournament.id, scheduleDate),
    enabled: tab === 'schedule',
    placeholderData: (previous) => previous,
  });
  const otherGames = useInfiniteQuery({
    queryKey: ['tournaments', tournament.id, 'schedule', scheduleDate, 'other-games'],
    queryFn: ({ pageParam }) =>
      fetchTournamentScheduleOtherGames(
        tournament.id,
        scheduleDate,
        pageParam as TournamentScheduleCursor | null,
      ),
    initialPageParam: null as TournamentScheduleCursor | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: false,
  });
  const standings = useQuery({
    queryKey: ['tournaments', tournament.id, 'standings'],
    queryFn: () => fetchTournamentStandings(tournament.id),
    enabled: tab === 'standings',
  });
  const bracket = useQuery({
    queryKey: ['tournaments', tournament.id, 'bracket'],
    queryFn: () => fetchTournamentBracket(tournament.id),
    enabled: tab === 'playoff',
  });
  const participants = useQuery({
    queryKey: ['tournaments', tournament.id, 'participants'],
    queryFn: () => fetchTournamentParticipants(tournament.id),
    enabled: participantsOpen,
  });
  const registration = useMutation({
    mutationFn: async () => {
      if (tournament.myParticipantState === null || tournament.myParticipantState === 'invited') {
        await applyToTournament(tournament.id);
      } else {
        await withdrawFromTournament(tournament.id);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tournaments'] }),
  });

  useEffect(() => {
    const days = schedule.data?.days;
    if (tab !== 'schedule' || days === undefined) return;
    setScheduleDate((currentDate) =>
      scheduleDateAfterDaysLoad(
        currentDate,
        days,
        String(tournament.rules.config.timezone ?? 'Europe/Moscow'),
        scheduleDateManuallySelected.current,
      ),
    );
  }, [schedule.data?.days, tab, tournament.id, tournament.rules.config.timezone]);
  const openFixture = useMutation({
    mutationFn: async ({ fixtureId, generation }: { fixtureId: string; generation: number }) => ({
      fixtureId,
      generation,
      segment: await openTournamentFixtureSegment(tournament.id, fixtureId),
    }),
    onSuccess: ({ fixtureId, generation, segment }) => {
      if (generation !== openFixtureGeneration.current || fixtureId !== activeFixtureId.current) {
        return;
      }
      const params = new URLSearchParams({
        view: 'amateur',
        section: 'tournaments',
        tournament: tournament.id,
        tab: 'schedule',
      });
      if (new URLSearchParams(location.search).get('from') === 'sections') {
        params.set('from', 'sections');
      }
      params.set('match', segment.duelMatchId);
      params.set('fixture', fixtureId);
      params.set('play', '1');
      navigate(`/?${params.toString()}`);
    },
    onSettled: (_data, _error, variables) => {
      if (variables.generation === openFixtureGeneration.current) {
        fixtureOpeningRef.current = false;
      }
    },
  });

  return (
    <div className="tournament-details">
      <section className="glass tournament-details__hero">
        <div className="tournament-details__status-row">
          <span className="section-label">{registrationState.label}</span>
          <span className="tournament-participation-badge">{participationLabel(tournament)}</span>
        </div>
        <h2>{tournament.title}</h2>
        <div className="tournament-details__description">{tournament.description}</div>
        {registrationState.timingLabel && (
          <div className="tournament-details__timing">{registrationState.timingLabel}</div>
        )}
      </section>
      <SegmentedTabs
        ariaLabel="Разделы турнира"
        activeTab={tab}
        items={visibleTabs.map((item) => ({ id: item.key, label: item.label }))}
        onChange={(nextTab) => {
          if (nextTab === 'schedule') scheduleDateManuallySelected.current = false;
          setScheduleDate((currentDate) =>
            scheduleDateForTabChange(nextTab, tournament, currentDate),
          );
          setTab(nextTab);
        }}
        scrollable
      />
      <section className="glass tournament-details__content">
        {tab === 'rules' && (
          <>
            <div className="tournament-overview-layout">
              <section className="tournament-overview-dates">
                <h3>Сроки</h3>
                <dl>
                  <div>
                    <dt>Начало регистрации</dt>
                    <dd>
                      {tournamentDateLabel(
                        tournament.registrationOpensAt,
                        String(tournament.rules.config.timezone ?? 'Europe/Moscow'),
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Конец регистрации</dt>
                    <dd>
                      {tournamentDateLabel(
                        tournament.registrationClosesAt,
                        String(tournament.rules.config.timezone ?? 'Europe/Moscow'),
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Первый тур</dt>
                    <dd>
                      {tournamentDateLabel(
                        tournament.startsAt,
                        String(tournament.rules.config.timezone ?? 'Europe/Moscow'),
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{tournament.completedAt ? 'Турнир завершён' : 'Плановое окончание'}</dt>
                    <dd>
                      {tournamentDateLabel(
                        tournament.completedAt ?? tournament.projectedEndsAt,
                        String(tournament.rules.config.timezone ?? 'Europe/Moscow'),
                      )}
                    </dd>
                  </div>
                </dl>
              </section>
              <div className="tournament-overview-grid">
                <button
                  type="button"
                  className="tournament-overview-grid__participants"
                  onClick={() => setParticipantsOpen(true)}
                >
                  <span>Участники</span>
                  <strong>
                    {tournament.participantCount} / {tournament.rules.config.participantLimit}
                  </strong>
                </button>
                <div>
                  <span>Плей-офф</span>
                  <strong>
                    {numberValue(tournament.rules.config.playoffSize)}{' '}
                    {pluralRu(
                      numberValue(tournament.rules.config.playoffSize),
                      'игрок',
                      'игрока',
                      'игроков',
                    )}
                  </strong>
                </div>
                <div>
                  <span>Вступительный взнос</span>
                  <strong>
                    {tournament.rules.config.entryFeeCoins === 0
                      ? 'Бесплатно'
                      : `${tournament.rules.config.entryFeeCoins} монет`}
                  </strong>
                </div>
              </div>
            </div>
            <TournamentRules tournament={tournament} />
          </>
        )}
        {tab === 'standings' &&
          (standings.isLoading ? (
            <div role="status">Загрузка таблицы…</div>
          ) : standings.isError ? (
            <div role="status">Не удалось загрузить таблицу.</div>
          ) : standings.data?.standings.length ? (
            <TournamentStandingsTable
              rows={standings.data.standings}
              regularSource={String(tournament.rules.config.regularSource ?? '')}
              playoffSize={Number(tournament.rules.config.playoffSize ?? 0)}
              dailyMetric={
                typeof tournament.rules.config.dailyMetric === 'string'
                  ? tournament.rules.config.dailyMetric
                  : null
              }
            />
          ) : (
            <div>Таблица появится после первых результатов.</div>
          ))}
        {tab === 'schedule' &&
          (schedule.isLoading ? (
            <div role="status">Загрузка расписания…</div>
          ) : schedule.isError ? (
            <div role="status">Не удалось загрузить расписание.</div>
          ) : schedule.data ? (
            <TournamentScheduleCalendar
              fixtures={[
                ...(schedule.data.myGames ??
                  (schedule.data as unknown as { fixtures?: TournamentFixture[] }).fixtures ??
                  []),
                ...(otherGames.data?.pages.flatMap((page) => page.games) ?? []),
              ]}
              fixtureDays={schedule.data.days ?? []}
              selectedDate={scheduleDate}
              onSelectDate={(date) => {
                scheduleDateManuallySelected.current = true;
                setScheduleDate(date);
              }}
              hasOtherGames={schedule.data.hasOtherGames ?? false}
              otherGamesLoaded={otherGames.data !== undefined}
              otherGamesLoading={otherGames.isFetching}
              hasMoreOtherGames={otherGames.hasNextPage}
              onLoadOtherGames={() => void otherGames.fetchNextPage()}
              matchdays={schedule.data.matchdays ?? []}
              regularSource={tournament.regularSource}
              tournamentStatus={tournament.status}
              currentUserId={currentUserId}
              isParticipant={tournament.myParticipantState === 'approved'}
              timezone={String(tournament.rules.config.timezone ?? 'Europe/Moscow')}
              rangeStartsAt={tournament.startsAt}
              rangeEndsAt={tournament.completedAt ?? tournament.projectedEndsAt ?? null}
              playoffStartsAt={tournamentPlayoffStartsAt(tournament)}
              onOpenDailyGame={() => {
                const params = new URLSearchParams({
                  view: tournament.regularSource === 'classic' ? 'classic' : 'daily',
                  section: 'tournaments',
                  tournament: tournament.id,
                  tab: 'schedule',
                });
                if (new URLSearchParams(location.search).get('from') === 'sections') {
                  params.set('from', 'sections');
                }
                navigate(`/?${params.toString()}`);
              }}
              renderMatchdayResults={(matchday) =>
                currentUserId === null ? null : (
                  <TournamentMatchdayResults
                    tournamentId={tournament.id}
                    matchdayNumber={matchday.number}
                    viewerUserId={currentUserId}
                  />
                )
              }
              formatDateTime={(value) =>
                tournamentDateLabel(
                  value,
                  String(tournament.rules.config.timezone ?? 'Europe/Moscow'),
                )
              }
              renderFixture={(fixture, mine, inSeries = false) => {
                const playable = fixtureCanOpen(fixture);
                const showSeed = fixture.stage === 'playoff' || fixture.stage === 'third_place';
                const finished = fixtureHasResult(fixture);
                const myResult = mine ? myFixtureResultLabel(fixture, currentUserId) : null;
                const technicalResultLabel = fixtureTechnicalResultLabel(fixture);
                return (
                  <article
                    key={fixture.id}
                    className={`tournament-fixture-card${mine ? ' tournament-fixture-card--mine' : ''}`}
                  >
                    <div className="tournament-fixture-card__meta">
                      {!inSeries && (
                        <span>
                          {fixtureTimeLabel(
                            fixture,
                            String(tournament.rules.config.timezone ?? 'Europe/Moscow'),
                            finished,
                          )}
                        </span>
                      )}
                      {mine && <VenueBadge role={fixtureVenueRole(fixture, currentUserId)} />}
                      <strong>{finished ? 'Завершена' : fixtureStatusLabel(fixture.status)}</strong>
                    </div>
                    <div className="tournament-fixture-summary">
                      <div className="tournament-fixture-matchup">
                        <div className="tournament-fixture-matchup__avatars">
                          <UserAvatar
                            avatarUrl={fixture.home?.avatarUrl}
                            name={fixture.home?.name}
                            size={28}
                            alt={fixture.home?.name ?? 'Хозяин'}
                          />
                          <UserAvatar
                            avatarUrl={fixture.away?.avatarUrl}
                            name={fixture.away?.name}
                            size={28}
                            alt={fixture.away?.name ?? 'Гость'}
                          />
                        </div>
                        <span className="tournament-fixture-matchup__names">
                          {fixturePlayerLabel(fixture.home, showSeed)} —{' '}
                          {fixturePlayerLabel(fixture.away, showSeed)}
                        </span>
                      </div>
                    </div>
                    {(finished || mine) && (
                      <div className="tournament-fixture-card__footer">
                        <div>
                          {finished && (
                            <>
                              {myResult !== null && (
                                <strong
                                  className={`tournament-fixture-result tournament-fixture-result--${myResult === 'Победа' ? 'win' : 'loss'}`}
                                >
                                  {myResult}
                                </strong>
                              )}
                              <strong className="tournament-fixture-card__score">
                                {technicalResultLabel ??
                                  `Счёт ${fixture.score.home}:${fixture.score.away}`}
                              </strong>
                            </>
                          )}
                          {mine && playable && (
                            <>
                              <button
                                type="button"
                                className="admin-compact-btn tournament-fixture-card__action tournament-fixture-card__action--primary"
                                disabled={openFixture.isPending}
                                onClick={() => {
                                  if (fixtureOpeningRef.current) return;
                                  fixtureOpeningRef.current = true;
                                  const generation = openFixtureGeneration.current + 1;
                                  openFixtureGeneration.current = generation;
                                  activeFixtureId.current = fixture.id;
                                  openFixture.reset();
                                  openFixture.mutate({ fixtureId: fixture.id, generation });
                                }}
                              >
                                {openFixture.isPending && activeFixtureId.current === fixture.id
                                  ? 'Открываем…'
                                  : 'Открыть игру'}
                              </button>
                              {openFixture.isError && activeFixtureId.current === fixture.id && (
                                <span className="tournament-fixture-card__error" role="alert">
                                  Не удалось открыть игру. Попробуйте ещё раз.
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                );
              }}
            />
          ) : (
            <div>Расписание ещё не опубликовано.</div>
          ))}
        {tab === 'playoff' &&
          (bracket.isLoading ? (
            <div role="status">Загрузка сетки…</div>
          ) : bracket.isError ? (
            <div role="status">Не удалось загрузить сетку плей-офф.</div>
          ) : bracket.data?.series.length ? (
            <TournamentPlayoffBracket
              key={tournament.id}
              tournamentId={tournament.id}
              currentUserId={currentUserId}
              onOpenFixture={(fixtureId) => {
                if (fixtureOpeningRef.current) return;
                fixtureOpeningRef.current = true;
                const generation = openFixtureGeneration.current + 1;
                openFixtureGeneration.current = generation;
                activeFixtureId.current = fixtureId;
                openFixture.reset();
                openFixture.mutate({ fixtureId, generation });
              }}
              series={bracket.data.series}
              timezone={String(tournament.rules.config.timezone ?? 'Europe/Moscow')}
              {...(tournament.playoffFormats === undefined
                ? {}
                : { formats: tournament.playoffFormats })}
            />
          ) : (
            <div>Сетка появится после завершения регулярного чемпионата.</div>
          ))}
      </section>
      {tournament.status === 'registration' &&
        !registrationState.hideAction &&
        (tournament.myParticipantState === null ||
          ['invited', 'applied', 'approved'].includes(tournament.myParticipantState)) && (
          <button
            type="button"
            className={`btn btn--cta tournament-details__registration${
              tournament.myParticipantState === 'applied' ||
              tournament.myParticipantState === 'approved'
                ? ' tournament-registration-btn--danger'
                : ''
            }`}
            disabled={!registrationState.isOpen || registration.isPending}
            onClick={() => registration.mutate()}
          >
            {!registrationState.isOpen
              ? registrationState.actionLabel
              : tournament.myParticipantState === null
                ? 'Подать заявку'
                : tournament.myParticipantState === 'invited'
                  ? 'Принять приглашение'
                  : 'Отменить заявку'}
          </button>
        )}
      {registration.isError && (
        <div role="alert" className="tournament-details__registration-error">
          Не удалось изменить участие. Проверьте соединение и попробуйте ещё раз.
        </div>
      )}
      {participantsOpen && (
        <AccessibleModal
          title="Участники"
          ariaLabel="Участники"
          onClose={() => setParticipantsOpen(false)}
          headerAction={
            <button
              type="button"
              className="icon-btn"
              aria-label="Закрыть список участников"
              onClick={() => setParticipantsOpen(false)}
            >
              <X size={16} />
            </button>
          }
        >
          <div className="tournament-participants-list tournament-participants-list--scrollable">
            {participants.isLoading && <div role="status">Загрузка участников…</div>}
            {participants.isError && <div role="status">Не удалось загрузить участников.</div>}
            {participants.data?.participants.map((participant, index) => (
              <div key={participant.userId} className="tournament-participants-list__row">
                <span className="tournament-participants-list__position">{index + 1}</span>
                <span className="tournament-participants-list__avatar">
                  <UserAvatar
                    avatarUrl={participant.avatarUrl}
                    name={participant.displayName}
                    size={38}
                    fontSize={14}
                    alt={participant.displayName}
                    style={{ background: 'rgba(30, 91, 151, 0.13)', color: '#244d73' }}
                  />
                </span>
                <strong>{participant.displayName}</strong>
                <span>
                  {participant.seed === null ? 'Без посева' : `Посев ${participant.seed}`}
                </span>
              </div>
            ))}
            {participants.isSuccess && participants.data.participants.length === 0 && (
              <div>Подтверждённых участников пока нет.</div>
            )}
          </div>
        </AccessibleModal>
      )}
    </div>
  );
}

type TournamentCatalogProps = {
  selectedTournamentId?: string | null;
  onSelectedTournamentIdChange?: (tournamentId: string | null) => void;
};

export function TournamentCatalog({
  selectedTournamentId,
  onSelectedTournamentIdChange,
}: TournamentCatalogProps = {}): JSX.Element {
  const location = useLocation();
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(() =>
    new URLSearchParams(location.search).get('tournament'),
  );
  const selectedId = selectedTournamentId === undefined ? internalSelectedId : selectedTournamentId;
  const setSelectedId = (tournamentId: string | null): void => {
    setInternalSelectedId(tournamentId);
    onSelectedTournamentIdChange?.(tournamentId);
  };
  const catalog = useQuery({ queryKey: ['tournaments'], queryFn: fetchTournaments });
  const tournaments = catalog.data?.tournaments ?? [];
  const selected = tournaments.find((tournament) => tournament.id === selectedId);
  if (selected) return <TournamentDetails tournament={selected} />;
  if (catalog.isLoading) return <div role="status">Загрузка турниров…</div>;
  if (catalog.isError) return <div role="status">Турниры пока недоступны.</div>;
  if (tournaments.length === 0) {
    return (
      <div role="status" className="tournament-catalog__empty">
        Турниров пока нет.
      </div>
    );
  }
  const sections = [
    {
      title: 'Активные турниры',
      tournaments: tournaments.filter((tournament) =>
        ['regular', 'playoff', 'paused'].includes(tournament.status),
      ),
    },
    {
      title: 'Предстоящие',
      tournaments: tournaments.filter((tournament) =>
        ['registration', 'registration_blocked', 'scheduling'].includes(tournament.status),
      ),
    },
    {
      title: 'Завершённые',
      tournaments: tournaments.filter((tournament) =>
        ['completed', 'cancelled'].includes(tournament.status),
      ),
    },
  ].filter((section) => section.tournaments.length > 0);
  return (
    <div className="tournament-catalog">
      {sections.map((section) => (
        <section key={section.title} className="tournament-catalog__section">
          <h2 className="section-label sections-group__title">{section.title}</h2>
          <div className="tournament-catalog__cards">
            {section.tournaments.map((tournament) => (
              <button
                key={tournament.id}
                type="button"
                aria-label={`Открыть ${tournament.title}`}
                className="glass tournament-catalog-card"
                onClick={() => setSelectedId(tournament.id)}
              >
                <img
                  className="tournament-catalog-card__image"
                  src={tournament.imageUrl ?? '/modes/tournaments.webp'}
                  alt={tournament.title}
                  onError={(event) => {
                    if (!event.currentTarget.src.endsWith('/modes/tournaments.webp')) {
                      event.currentTarget.src = '/modes/tournaments.webp';
                    }
                  }}
                />
                <span className="tournament-catalog-card__content">
                  <span className="tournament-catalog-card__topline">
                    <span className="section-label">{registrationWindow(tournament).label}</span>
                    {(tournament.myParticipantState !== null ||
                      tournament.status === 'completed') && (
                      <span className="tournament-participation-badge">
                        {participationLabel(tournament)}
                      </span>
                    )}
                  </span>
                  <span className="tournament-catalog-card__title">{tournament.title}</span>
                  <span className="tournament-catalog-card__meta">
                    {tournament.participantCount} / {tournament.rules.config.participantLimit}{' '}
                    участников
                  </span>
                  {(registrationWindow(tournament).timingLabel ??
                    importantTournamentDate(tournament)) && (
                    <span className="tournament-catalog-card__date">
                      {registrationWindow(tournament).timingLabel ??
                        importantTournamentDate(tournament)}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
