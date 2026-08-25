import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  applyToTournament,
  fetchTournamentSchedule,
  fetchTournamentStandings,
  fetchTournamentBracket,
  fetchTournaments,
  openTournamentFixtureSegment,
  withdrawFromTournament,
  type TournamentFixture,
  type TournamentSummary,
} from '../api/tournament.js';
import { TournamentFixtureLive } from './TournamentFixtureLive.js';
import { useAuthStore } from '../auth/authStore.js';
import { VenueBadge, type VenueRole } from '../components/VenueBadge.js';
import { SegmentedTabs } from '../components/SegmentedTabs.js';

type TournamentTab = 'overview' | 'standings' | 'schedule' | 'playoff' | 'rules';

const tabs: Array<{ key: TournamentTab; label: string }> = [
  { key: 'overview', label: 'Обзор' },
  { key: 'standings', label: 'Таблица' },
  { key: 'schedule', label: 'Расписание' },
  { key: 'playoff', label: 'Плей-офф' },
  { key: 'rules', label: 'Правила и призы' },
];

function fixtureVenueRole(fixture: TournamentFixture, currentUserId: string | null): VenueRole {
  if (fixture.venueMode === 'neutral_default') return 'neutral';
  return fixture.away?.userId === currentUserId ? 'away' : 'home';
}

function statusLabel(status: TournamentSummary['status']): string {
  const labels: Record<TournamentSummary['status'], string> = {
    registration: 'Идёт регистрация',
    registration_blocked: 'Набор продлён',
    scheduling: 'Готовится расписание',
    regular: 'Регулярный чемпионат',
    playoff: 'Плей-офф',
    paused: 'Приостановлен',
    completed: 'Завершён',
    cancelled: 'Отменён',
  };
  return labels[status];
}

function participantStateLabel(state: string | null): string {
  if (state === null) return 'Вы ещё не заявлены';
  const labels: Record<string, string> = {
    invited: 'Вас пригласили',
    applied: 'Заявка на рассмотрении',
    approved: 'Вы участвуете',
    rejected: 'Заявка отклонена',
    declined: 'Приглашение отклонено',
    withdrawn: 'Вы снялись с турнира',
    removed: 'Участие отменено администратором',
    disqualified: 'Дисквалификация',
  };
  return labels[state] ?? 'Статус участия уточняется';
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
  return labels[status] ?? status;
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
} {
  if (tournament.status !== 'registration') {
    return { isOpen: false, label: statusLabel(tournament.status), actionLabel: '' };
  }
  const opensAt =
    tournament.registrationOpensAt === null ? null : new Date(tournament.registrationOpensAt);
  const closesAt =
    tournament.registrationClosesAt === null ? null : new Date(tournament.registrationClosesAt);
  if (opensAt !== null && Number.isFinite(opensAt.getTime()) && now < opensAt) {
    return {
      isOpen: false,
      label: `Регистрация откроется ${opensAt.toLocaleString('ru-RU')}`,
      actionLabel: 'Регистрация ещё не открыта',
    };
  }
  if (closesAt !== null && Number.isFinite(closesAt.getTime()) && now >= closesAt) {
    return { isOpen: false, label: 'Регистрация завершена', actionLabel: 'Регистрация завершена' };
  }
  return { isOpen: true, label: 'Идёт регистрация', actionLabel: '' };
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
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

function TournamentRules({ tournament }: { tournament: TournamentSummary }): JSX.Element {
  const config = objectValue(tournament.rules.config);
  const playoffRounds = Array.isArray(tournament.rules.playoffRounds)
    ? tournament.rules.playoffRounds
    : [];
  const stageRewards = objectValue(tournament.rules.stageRewards);
  const regularRewards = Array.isArray(stageRewards.regular) ? stageRewards.regular : [];
  const playoffRewards = Array.isArray(stageRewards.playoff) ? stageRewards.playoff : [];
  const tieBreakLabels: Record<string, string> = {
    points: 'очки',
    wins: 'победы',
    goal_difference: 'разница голов',
    goals_for: 'забитые голы',
  };
  const tieBreakCriteria = Array.isArray(tournament.rules.tieBreakCriteria)
    ? tournament.rules.tieBreakCriteria
        .map(String)
        .map((criterion) => tieBreakLabels[criterion] ?? criterion)
        .join(' → ')
    : 'по очкам';
  const regularSource = config.regularSource ?? tournament.regularSource;
  const cycles = numberValue(config.roundRobinCycles, 1);
  const roundsPerDay = numberValue(config.roundsPerDay, 1);
  const dailyMetricLabels: Record<string, string> = {
    goals_sum: 'сумма голов',
    accuracy_average: 'средняя точность',
    daily_place_points: 'очки за место',
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <div className="section-label" style={{ margin: 0 }}>
          Регулярный чемпионат
        </div>
        <div style={{ marginTop: 5 }}>
          {regularSource === 'daily_aggregate'
            ? `${numberValue(config.dailyDays)} дней · ${dailyMetricLabels[String(config.dailyMetric ?? 'goals_sum')] ?? String(config.dailyMetric)} · ${config.bestDays === null || config.bestDays === undefined ? 'учитываются все дни' : `лучшие ${String(config.bestDays)} дней`}`
            : `${cycles} ${pluralRu(cycles, 'круг', 'круга', 'кругов')} · ${roundsPerDay} ${pluralRu(roundsPerDay, 'тур', 'тура', 'туров')} в день · первый тур в ${String(config.firstRoundLocalTime ?? 'не задан')}`}
        </div>
        <div style={{ marginTop: 5 }}>Критерии равенства: {tieBreakCriteria}</div>
      </div>
      <div>
        <div className="section-label" style={{ margin: 0 }}>
          Плей-офф
        </div>
        <div style={{ display: 'grid', gap: 5, marginTop: 5 }}>
          {playoffRounds.map((value, index) => {
            const round = objectValue(value);
            const homeSequence = Array.isArray(round.homeSequence)
              ? round.homeSequence
                  .map((side) => (String(side) === 'H' ? 'Дом' : 'Гости'))
                  .join(' · ')
              : 'не задан';
            const overtime = objectValue(round.overtime);
            return (
              <div key={String(round.roundNumber ?? index)}>
                <div>
                  Раунд {numberValue(round.roundNumber, index + 1)}: до{' '}
                  {numberValue(round.winsRequired, 1)} побед · {homeSequence}
                </div>
                <div style={{ color: 'var(--muted)' }}>
                  Овертаймов: {numberValue(overtime.count, 1)} · стартовых буллитов:{' '}
                  {numberValue(overtime.shootoutInitialShots, 3)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <div className="section-label" style={{ margin: 0 }}>
          Призы регулярки
        </div>
        {regularRewards
          .map(rewardLabel)
          .filter((label): label is string => label !== null)
          .map((label) => (
            <div key={label}>{label}</div>
          ))}
        {regularRewards.length === 0 && <div>Награды не назначены.</div>}
      </div>
      <div>
        <div className="section-label" style={{ margin: 0 }}>
          Призы плей-офф
        </div>
        {playoffRewards
          .map(rewardLabel)
          .filter((label): label is string => label !== null)
          .map((label) => (
            <div key={label}>{label}</div>
          ))}
        {playoffRewards.length === 0 && <div>Награды не назначены.</div>}
      </div>
      <div style={{ color: 'var(--muted)' }}>
        Опубликованная ревизия №{tournament.revision} неизменяема после старта.
      </div>
    </div>
  );
}

function TournamentDetails({
  tournament,
  onBack,
}: {
  tournament: TournamentSummary;
  onBack: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const [tab, setTab] = useState<TournamentTab>('overview');
  const [selectedFixture, setSelectedFixture] = useState<TournamentFixture | null>(null);
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
    mutationFn: (fixtureId: string) => openTournamentFixtureSegment(tournament.id, fixtureId),
    onSuccess: (segment) => {
      navigate(
        `/?view=amateur&section=tournaments${new URLSearchParams(location.search).get('from') === 'sections' ? '&from=sections' : ''}&match=${encodeURIComponent(segment.duelMatchId)}&play=1`,
      );
    },
  });

  if (selectedFixture !== null) {
    return (
      <TournamentFixtureLive
        fixture={selectedFixture}
        onBack={() => setSelectedFixture(null)}
        onPlay={() => openFixture.mutate(selectedFixture.id)}
        playPending={openFixture.isPending}
        playError={openFixture.isError}
      />
    );
  }

  return (
    <div className="tournament-details">
      <button type="button" className="tournament-back-btn" onClick={onBack}>
        К списку турниров
      </button>
      <section className="glass tournament-details__hero">
        <div className="tournament-details__status-row">
          <span className="section-label">{registrationState.label}</span>
          <span className="tournament-participation-badge">
            {participantStateLabel(tournament.myParticipantState)}
          </span>
        </div>
        <h2>{tournament.title}</h2>
        <div className="tournament-details__description">{tournament.description}</div>
      </section>
      <SegmentedTabs
        ariaLabel="Разделы турнира"
        activeTab={tab}
        items={tabs.map((item) => ({ id: item.key, label: item.label }))}
        onChange={setTab}
      />
      <section className="glass tournament-details__content">
        {tab === 'overview' && (
          <div className="tournament-overview-grid">
            <div>
              <span>Участники</span>
              <strong>
                {tournament.participantCount} / {tournament.rules.config.participantLimit}
              </strong>
            </div>
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
        )}
        {tab === 'standings' &&
          (standings.isLoading ? (
            <div role="status">Загрузка таблицы…</div>
          ) : standings.isError ? (
            <div role="status">Не удалось загрузить таблицу.</div>
          ) : standings.data?.standings.length ? (
            <div className="tournament-standing-list">
              {standings.data.standings.map((row, index) => (
                <div key={String(row.user_id ?? index)}>
                  <strong>{index + 1}</strong>
                  <span>{String(row.display_name ?? row.user_id ?? index + 1)}</span>
                  <span>{String(row.points ?? '')}</span>
                </div>
              ))}
            </div>
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
                    {(fixture.status === 'completed' ||
                      fixture.score.home + fixture.score.away > 0) && (
                      <div className="tournament-fixture-card__score">
                        Счёт {fixture.score.home}:{fixture.score.away}
                      </div>
                    )}
                    {mine && playable && (
                      <button
                        type="button"
                        className="admin-compact-btn tournament-fixture-card__action"
                        onClick={() => setSelectedFixture(fixture)}
                      >
                        Открыть live
                      </button>
                    )}
                  </article>
                );
              })}
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
            className="btn btn--cta tournament-details__registration"
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
    </div>
  );
}

export function TournamentCatalog(): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const catalog = useQuery({ queryKey: ['tournaments'], queryFn: fetchTournaments });
  const tournaments = catalog.data?.tournaments ?? [];
  const selected = tournaments.find((tournament) => tournament.id === selectedId);
  if (selected)
    return <TournamentDetails tournament={selected} onBack={() => setSelectedId(null)} />;
  if (catalog.isLoading) return <div role="status">Загрузка турниров…</div>;
  if (catalog.isError) return <div role="status">Турниры пока недоступны.</div>;
  if (tournaments.length === 0) return <div role="status">Сейчас нет открытых турниров.</div>;
  return (
    <div className="tournament-catalog">
      {tournaments.map((tournament) => (
        <button
          key={tournament.id}
          type="button"
          aria-label={`Открыть ${tournament.title}`}
          className="glass tournament-catalog-card"
          onClick={() => setSelectedId(tournament.id)}
        >
          <span className="tournament-catalog-card__topline">
            <span className="section-label">{registrationWindow(tournament).label}</span>
            {tournament.myParticipantState !== null && (
              <span className="tournament-participation-badge">
                {participantStateLabel(tournament.myParticipantState)}
              </span>
            )}
          </span>
          <span className="tournament-catalog-card__title">{tournament.title}</span>
          <span className="tournament-catalog-card__meta">
            {tournament.participantCount} / {tournament.rules.config.participantLimit} участников
          </span>
        </button>
      ))}
    </div>
  );
}
