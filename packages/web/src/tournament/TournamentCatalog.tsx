import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import {
  applyToTournament,
  fetchTournamentSchedule,
  fetchTournamentStandings,
  fetchTournamentBracket,
  fetchTournaments,
  fetchTournamentParticipants,
  openTournamentFixtureSegment,
  withdrawFromTournament,
  type TournamentFixture,
  type TournamentSummary,
} from '../api/tournament.js';
import { TournamentFixtureLive } from './TournamentFixtureLive.js';
import { useAuthStore } from '../auth/authStore.js';
import { VenueBadge, type VenueRole } from '../components/VenueBadge.js';
import { SegmentedTabs } from '../components/SegmentedTabs.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { UserAvatar } from '../chat/components/UserAvatar.js';
import { tournamentStatusLabel } from './labels.js';
import { tournamentTimezoneLabel } from './timezoneLabel.js';
import { TournamentStandingsTable } from './TournamentStandingsTable.js';
import { TournamentMatchdayRow } from './TournamentMatchdayTimes.js';

type TournamentTab = 'overview' | 'standings' | 'schedule' | 'playoff' | 'rules';

const tabs: Array<{ key: TournamentTab; label: string }> = [
  { key: 'overview', label: 'Обзор' },
  { key: 'standings', label: 'Таблица' },
  { key: 'schedule', label: 'Расписание' },
  { key: 'playoff', label: 'Плей-офф' },
  { key: 'rules', label: 'Правила и призы' },
];

function tournamentTabFromSearch(search: string): TournamentTab {
  const requested = new URLSearchParams(search).get('tab');
  return tabs.some((tab) => tab.key === requested) ? (requested as TournamentTab) : 'overview';
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
  return participantStateLabel(tournament.myParticipantState);
}

function fixtureStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    conditional: 'Условная игра',
    scheduled: 'Запланирована',
    open: 'Окно открыто',
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

function fixtureTimeLabel(fixture: TournamentFixture): string {
  if (fixture.scheduledStartsAt === null) return 'Время ещё не назначено';
  const startsAt = new Date(fixture.scheduledStartsAt);
  if (!Number.isFinite(startsAt.getTime())) return 'Время ещё не назначено';
  return startsAt.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function registrationWindow(
  tournament: TournamentSummary,
  now = new Date(),
): {
  isOpen: boolean;
  label: string;
  actionLabel: string;
  timingLabel: string | null;
} {
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
    return { isOpen: false, ...copy, actionLabel: '' };
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
    };
  }
  if (closesAt !== null && Number.isFinite(closesAt.getTime()) && now >= closesAt) {
    return {
      isOpen: false,
      label: 'Регистрация завершена',
      timingLabel: 'Готовим расписание',
      actionLabel: 'Регистрация завершена',
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
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
  const regularDescription =
    regularSource === 'daily_aggregate'
      ? `Турнир продлится ${numberValue(config.dailyDays)} ${pluralRu(numberValue(config.dailyDays), 'день', 'дня', 'дней')}. Результат каждого дня определяется ${dailyMetricLabels[String(config.dailyMetric ?? 'goals_sum')] ?? 'по количеству голов'}. ${config.bestDays === null || config.bestDays === undefined ? 'В итог войдут результаты всех дней.' : `В итог войдут лучшие ${String(config.bestDays)} ${pluralRu(numberValue(config.bestDays), 'день', 'дня', 'дней')}.`}`
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
            const overtime = objectValue(round.overtime);
            const roundNumber = numberValue(round.roundNumber, index + 1);
            const winsRequired = numberValue(round.winsRequired, 1);
            const overtimeCount = numberValue(overtime.count, 1);
            const shootoutShots = numberValue(overtime.shootoutInitialShots, 3);
            return (
              <article className="tournament-rules__round" key={String(round.roundNumber ?? index)}>
                <h4>{playoffRoundTitle(roundNumber)}</h4>
                <p>
                  Серия идёт до {winsRequired} {pluralRu(winsRequired, 'победы', 'побед', 'побед')}.
                </p>
                <p>{homeSequenceSentence(round.homeSequence)}</p>
                <p className="tournament-rules__muted">
                  Если основное время закончится вничью, будет {overtimeCount}{' '}
                  {pluralRu(overtimeCount, 'овертайм', 'овертайма', 'овертаймов')}. Затем — буллиты:
                  по {shootoutShots} {pluralRu(shootoutShots, 'броску', 'броска', 'бросков')}{' '}
                  каждому, после этого по одному до победы.
                </p>
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
  const [tab, setTab] = useState<TournamentTab>(() => tournamentTabFromSearch(location.search));
  const [selectedFixture, setSelectedFixture] = useState<TournamentFixture | null>(null);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const activeFixtureId = useRef<string | null>(null);
  const openFixtureGeneration = useRef(0);
  const queryClient = useQueryClient();
  const registrationState = registrationWindow(tournament);
  const schedule = useQuery({
    queryKey: ['tournaments', tournament.id, 'schedule'],
    queryFn: () => fetchTournamentSchedule(tournament.id),
    enabled: tab === 'schedule',
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
      params.set('play', '1');
      navigate(`/?${params.toString()}`);
    },
  });

  if (selectedFixture !== null) {
    return (
      <TournamentFixtureLive
        fixture={selectedFixture}
        onBack={() => {
          openFixtureGeneration.current += 1;
          activeFixtureId.current = null;
          openFixture.reset();
          setSelectedFixture(null);
        }}
        onPlay={() => {
          const generation = openFixtureGeneration.current + 1;
          openFixtureGeneration.current = generation;
          activeFixtureId.current = selectedFixture.id;
          openFixture.mutate({ fixtureId: selectedFixture.id, generation });
        }}
        playPending={openFixture.isPending}
        playError={openFixture.isError}
      />
    );
  }

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
        items={tabs.map((item) => ({ id: item.key, label: item.label }))}
        onChange={setTab}
        scrollable
      />
      <section className="glass tournament-details__content">
        {tab === 'overview' && (
          <div className="tournament-overview-layout">
            <section className="tournament-overview-dates">
              <h3>Сроки</h3>
              <dl>
                <div>
                  <dt>Регистрация</dt>
                  <dd>
                    {tournamentDateLabel(
                      tournament.registrationOpensAt,
                      String(tournament.rules.config.timezone ?? 'Europe/Moscow'),
                    )}{' '}
                    —{' '}
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
                <strong>{tournament.rules.config.playoffSize} игроков</strong>
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
          ) : schedule.data?.fixtures.length ? (
            <div className="tournament-fixture-list">
              {schedule.data.fixtures.map((fixture) => {
                const mine =
                  fixture.home?.userId === currentUserId || fixture.away?.userId === currentUserId;
                const playable =
                  fixture.status === 'scheduled' ||
                  fixture.status === 'open' ||
                  fixture.status === 'active';
                return (
                  <article key={fixture.id} className="tournament-fixture-card">
                    <div className="tournament-fixture-card__meta">
                      <span>{fixtureTimeLabel(fixture)}</span>
                      <strong>{fixtureStatusLabel(fixture.status)}</strong>
                    </div>
                    <div className="tournament-fixture-summary">
                      <span>
                        {fixture.home?.name ?? 'Участник'} — {fixture.away?.name ?? 'Участник'}
                      </span>
                      <VenueBadge role={fixtureVenueRole(fixture, currentUserId)} />
                    </div>
                    {(['settled', 'forfeit'].includes(fixture.status) ||
                      fixture.score.home + fixture.score.away > 0) && (
                      <div className="tournament-fixture-card__score">
                        Счёт {fixture.score.home}:{fixture.score.away}
                      </div>
                    )}
                    {mine && playable && (
                      <button
                        type="button"
                        className="admin-compact-btn tournament-fixture-card__action"
                        onClick={() => {
                          openFixtureGeneration.current += 1;
                          activeFixtureId.current = fixture.id;
                          openFixture.reset();
                          setSelectedFixture(fixture);
                        }}
                      >
                        Открыть игру
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (schedule.data?.matchdays?.length ?? 0) > 0 ? (
            <div className="tournament-matchday-list">
              {schedule.data!.matchdays!.map((matchday) => (
                <TournamentMatchdayRow
                  key={matchday.id}
                  number={matchday.number}
                  startsAt={matchday.startsAt}
                  endsAt={matchday.endsAt}
                  startLabel={tournamentDateLabel(
                    matchday.startsAt,
                    String(tournament.rules.config.timezone ?? 'Europe/Moscow'),
                  )}
                  endLabel={tournamentDateLabel(
                    matchday.endsAt,
                    String(tournament.rules.config.timezone ?? 'Europe/Moscow'),
                  )}
                />
              ))}
            </div>
          ) : (
            <div>Расписание ещё не опубликовано.</div>
          ))}
        {tab === 'playoff' &&
          (bracket.isLoading ? (
            <div role="status">Загрузка сетки…</div>
          ) : bracket.isError ? (
            <div role="status">Не удалось загрузить сетку плей-офф.</div>
          ) : bracket.data?.series.length ? (
            bracket.data.series.map((series, index) => (
              <div className="tournament-bracket-row" key={String(series.id ?? index)}>
                {String(series.higher_name ?? 'Определяется')} —{' '}
                {String(series.lower_name ?? 'Определяется')}
              </div>
            ))
          ) : (
            <div>Сетка появится после завершения регулярного чемпионата.</div>
          ))}
        {tab === 'rules' && <TournamentRules tournament={tournament} />}
      </section>
      {tournament.status === 'registration' &&
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

export function TournamentCatalog(): JSX.Element {
  const location = useLocation();
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    new URLSearchParams(location.search).get('tournament'),
  );
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
