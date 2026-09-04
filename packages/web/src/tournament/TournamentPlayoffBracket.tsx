import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type {
  TournamentBracketFixture,
  TournamentBracketSeries,
  TournamentFixtureAttemptState,
} from '../api/tournament.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { UserAvatar } from '../chat/components/UserAvatar.js';
import {
  PlayoffSeriesCard,
  TournamentPlayoffOverview,
  playoffFormatLabel,
  playoffSeriesScheduleLabel,
  playoffSeriesNumberMaps,
  playoffSeriesTitle,
  playoffStageName,
  type PlayoffSeriesSelection,
} from './TournamentPlayoffOverview.js';

interface TournamentPlayoffBracketProps {
  tournamentId: string;
  currentUserId: string | null;
  onOpenFixture: (fixtureId: string) => void;
  series: TournamentBracketSeries[];
  timezone: string;
  formats?: Array<{
    roundNumber: number;
    duelKind: 'express' | 'express_plus' | 'classic';
  }>;
  renderSeriesAction?: (series: TournamentBracketSeries) => ReactNode;
}

export function currentSeriesFixtureId(
  fixtures: Array<{ id: string; status: string }>,
): string | null {
  const active = fixtures.find((fixture) =>
    ['open', 'active', 'ready_check', 'paused'].includes(fixture.status),
  );
  if (active) return active.id;
  for (let index = fixtures.length - 1; index >= 0; index -= 1) {
    const fixture = fixtures[index];
    if (fixture && ['settled', 'forfeit'].includes(fixture.status)) return fixture.id;
  }
  return (
    fixtures.find((fixture) => fixture.status === 'scheduled')?.id ?? fixtures.at(-1)?.id ?? null
  );
}

function seriesScoreLabel(state: TournamentFixtureAttemptState): string | null {
  if (state.series === null) return null;
  if (state.series.myWins === state.series.opponentWins) {
    return `Серия: ничья ${state.series.myWins} : ${state.series.opponentWins}`;
  }
  return state.series.myWins > state.series.opponentWins
    ? `Серия: вы ведёте ${state.series.myWins} : ${state.series.opponentWins}`
    : `Серия: соперник ведёт ${state.series.opponentWins} : ${state.series.myWins}`;
}

function readinessMinutes(state: TournamentFixtureAttemptState): number {
  const startsAt = new Date(state.attempt.scheduledStart).getTime();
  const expiresAt = new Date(state.attempt.readinessExpiresAt).getTime();
  if (!Number.isFinite(startsAt) || !Number.isFinite(expiresAt)) return 5;
  return Math.max(1, Math.round((expiresAt - startsAt) / 60_000));
}

function formatRemaining(target: string | null): string | null {
  if (target === null) return null;
  const targetMs = new Date(target).getTime();
  if (!Number.isFinite(targetMs)) return null;
  const totalSeconds = Math.max(0, Math.ceil((targetMs - Date.now()) / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function useRemaining(target: string | null): string | null {
  const [remaining, setRemaining] = useState(() => formatRemaining(target));
  useEffect(() => {
    const update = () => setRemaining(formatRemaining(target));
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, [target]);
  return remaining;
}

function terminalGameLabel(
  state: TournamentFixtureAttemptState,
  currentUserId: string,
): string | null {
  if (['needs_reschedule', 'needs_admin_decision', 'cancelled'].includes(state.attempt.status)) {
    return null;
  }
  const result = state.attempt.result;
  if (result === null) return null;
  const won = result.winnerUserId === currentUserId;
  const technical = state.attempt.status === 'technical_result';
  if (technical) return won ? 'Техническая победа' : 'Техническое поражение';
  if (result.outcome === 'replay') return 'Ничья — нужна переигровка';
  if (result.myScore === null || result.opponentScore === null) {
    return won ? 'Победа в игре' : 'Поражение в игре';
  }
  return `${won ? 'Победа' : 'Поражение'} в игре · ${result.myScore}:${result.opponentScore}`;
}

export function TournamentPlayoffAttemptView(props: {
  state: TournamentFixtureAttemptState;
  currentUserId: string;
  timezone: string;
  onOpenGame: () => void;
  onOpenNextGame?: () => void;
}) {
  const state = props.state;
  const readinessRemaining = useRemaining(
    state.attempt.status === 'ready_check' ? state.attempt.readinessExpiresAt : null,
  );
  const opponentPeriodRemaining = useRemaining(
    state.attempt.status === 'active' && state.opponentProgress?.state === 'period_active'
      ? state.opponentProgress.periodEndsAt
      : null,
  );
  const nextGameRemaining = useRemaining(state.nextGame?.breakEndsAt ?? null);
  const replayStartRemaining = useRemaining(
    state.attempt.kind === 'replay' && state.attempt.status === 'pending'
      ? state.attempt.scheduledStart
      : null,
  );
  const scoreLabel = seriesScoreLabel(state);
  const isTerminal = [
    'settled',
    'technical_result',
    'needs_reschedule',
    'needs_admin_decision',
    'cancelled',
  ].includes(state.attempt.status);
  const terminalLabel = terminalGameLabel(state, props.currentUserId);
  const wonSeries =
    state.series?.status === 'completed' && state.series.winnerUserId === props.currentUserId;
  const wonTournament =
    state.tournament.status === 'completed' &&
    state.tournament.winnerUserId === props.currentUserId;
  return (
    <div className="tournament-playoff-attempt">
      {state.attempt.kind === 'replay' && !isTerminal && (
        <strong className="tournament-playoff-attempt__eyebrow">Переигровка</strong>
      )}
      {state.attempt.status === 'ready_check' && (
        <div className="tournament-playoff-attempt__readiness">
          <strong>
            {state.attempt.myReady
              ? 'Вы готовы'
              : `Подтвердите готовность в течение ${readinessMinutes(state)} минут`}
          </strong>
          <span>
            {state.attempt.opponentReady ? 'Соперник готов' : 'Ждём готовность соперника'}
          </span>
          {readinessRemaining !== null && <span>До закрытия готовности {readinessRemaining}</span>}
          {!state.attempt.myReady && (
            <button type="button" className="btn btn--cta" onClick={props.onOpenGame}>
              Подтвердить готовность
            </button>
          )}
        </div>
      )}
      {state.attempt.status === 'active' && (
        <div className="tournament-playoff-attempt__progress">
          {state.opponentProgress?.state === 'period_active' ? (
            <>
              <strong>Соперник играет {state.opponentProgress.currentPeriod}-й период</strong>
              <span>Дождитесь завершения игры соперника</span>
              {opponentPeriodRemaining !== null && (
                <span>До конца периода соперника {opponentPeriodRemaining}</span>
              )}
            </>
          ) : state.opponentProgress?.state === 'completed' ? (
            <strong>Соперник закончил игру</strong>
          ) : (
            <strong>Игра началась</strong>
          )}
          <button type="button" className="btn btn--cta" onClick={props.onOpenGame}>
            Открыть игру
          </button>
        </div>
      )}
      {state.attempt.status === 'pending' && (
        <div className="tournament-playoff-attempt__scheduled">
          <strong>
            {state.attempt.kind === 'replay' ? 'Переигровка по расписанию' : 'Игра по расписанию'}
          </strong>
          {state.attempt.kind === 'replay' ? (
            replayStartRemaining === '00:00' ? (
              <>
                <span>Переигровка готова к запуску.</span>
                <button type="button" className="btn btn--cta" onClick={props.onOpenGame}>
                  Открыть переигровку
                </button>
              </>
            ) : (
              <span>Переигровка откроется через {replayStartRemaining}</span>
            )
          ) : (
            <span>Подтверждение готовности откроется перед началом.</span>
          )}
        </div>
      )}
      {terminalLabel !== null && (
        <strong className="tournament-playoff-attempt__result">{terminalLabel}</strong>
      )}
      {state.attempt.status === 'technical_result' && (
        <span>
          {state.attempt.result?.winnerUserId === props.currentUserId
            ? 'Соперник не подтвердил готовность вовремя.'
            : 'Вы не подтвердили готовность вовремя.'}
        </span>
      )}
      {['needs_reschedule', 'needs_admin_decision'].includes(state.attempt.status) && (
        <div className="tournament-playoff-attempt__incident">
          <strong>Нужно новое время</strong>
          <span>Администратор назначит новую дату и время игры.</span>
        </div>
      )}
      {state.nextGame !== null && (
        <div className="tournament-playoff-attempt__choice">
          <strong>Следующая игра</strong>
          {state.nextGame.available ? (
            <>
              <span>Следующая игра доступна. Подтвердите готовность ещё раз.</span>
              {props.onOpenNextGame && (
                <button type="button" className="btn btn--cta" onClick={props.onOpenNextGame}>
                  Открыть следующую игру
                </button>
              )}
            </>
          ) : (
            <span>
              Следующая игра станет доступна после перерыва
              {nextGameRemaining === null ? '.' : ` через ${nextGameRemaining}`}
            </span>
          )}
        </div>
      )}
      {wonSeries ? (
        <strong className="tournament-playoff-attempt__series-win">
          {state.series!.myWins >= state.series!.winsRequired
            ? `Вы выиграли серию ${state.series!.myWins} : ${state.series!.opponentWins}`
            : 'Вы выиграли серию'}
        </strong>
      ) : (
        scoreLabel !== null && <strong>{scoreLabel}</strong>
      )}
      {state.series !== null && state.series.status !== 'completed' && (
        <span>До победы в {state.series.winsRequired} играх</span>
      )}
      {wonTournament && (
        <strong className="tournament-playoff-attempt__tournament-win">
          Вы — победитель турнира
        </strong>
      )}
    </div>
  );
}

function seriesStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Ожидает участников',
    scheduled: 'Запланирована',
    active: 'Идёт серия',
    completed: 'Завершена',
    settled: 'Завершена',
    paused: 'Приостановлена',
  };
  return labels[status] ?? 'Статус уточняется';
}

function gameDayLabel(startsAtValue: string | null, timezone: string): string {
  if (startsAtValue === null) return 'Дата игрового дня ещё не назначена';
  const startsAt = new Date(startsAtValue);
  if (!Number.isFinite(startsAt.getTime())) return 'Дата игрового дня ещё не назначена';
  const date = new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    day: 'numeric',
    month: 'long',
  }).format(startsAt);
  const startTime = new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(startsAt);
  return `${date}, начало в ${startTime}`;
}

function localDateKey(value: string | null, timezone: string): string | null {
  if (value === null) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function groupFixturesByGameDay(fixtures: TournamentBracketFixture[], timezone: string) {
  const groups = new Map<
    string,
    { startsAt: string | null; fixtures: TournamentBracketFixture[] }
  >();
  for (const fixture of fixtures) {
    const fallbackDate = localDateKey(fixture.scheduledStartsAt, timezone);
    const key = fixture.gameDay?.id ?? fallbackDate ?? 'unassigned';
    const startsAt = fixture.gameDay?.startsAt ?? fixture.scheduledStartsAt;
    const group = groups.get(key);
    if (group) {
      group.fixtures.push(fixture);
    } else {
      groups.set(key, { startsAt, fixtures: [fixture] });
    }
  }
  return [...groups.values()];
}

export function gameResultLabel(fixture: TournamentBracketFixture): string | null {
  if (!['settled', 'forfeit'].includes(fixture.status)) return null;
  if (fixture.status === 'forfeit') {
    const winnerName =
      fixture.winnerSide === 'home'
        ? fixture.homeName
        : fixture.winnerSide === 'away'
          ? fixture.awayName
          : null;
    return winnerName === null ? 'Технический результат' : `Техническая победа — ${winnerName}`;
  }
  if (
    fixture.homeName === null ||
    fixture.awayName === null ||
    fixture.homeScore === null ||
    fixture.awayScore === null
  ) {
    return null;
  }
  return `${fixture.homeName} ${fixture.homeScore} : ${fixture.awayScore} ${fixture.awayName}`;
}

function SeriesCard(props: {
  currentUserId: string | null;
  series: TournamentBracketSeries;
  title: string;
  byKey: Map<string, TournamentBracketSeries>;
  finalRound: number;
  seriesNumberByKey?: Map<string, number>;
  timezone: string;
  bronze?: boolean;
  onOpen: () => void;
}) {
  return <PlayoffSeriesCard {...props} />;
}

function SeriesDetailsModal(props: {
  selection: PlayoffSeriesSelection;
  tournamentId: string;
  currentUserId: string | null;
  timezone: string;
  onOpenFixture: (fixtureId: string) => void;
  onClose: () => void;
  renderSeriesAction?: (series: TournamentBracketSeries) => ReactNode;
}) {
  const { series, title } = props.selection;
  const players = [
    {
      userId: series.higher_user_id,
      name: series.higher_name,
      avatarUrl: series.higher_avatar_url,
      seed: series.higher_seed,
      wins: series.higher_seed_wins,
    },
    {
      userId: series.lower_user_id,
      name: series.lower_name,
      avatarUrl: series.lower_avatar_url,
      seed: series.lower_seed,
      wins: series.lower_seed_wins,
    },
  ];
  const statusLabel = seriesStatusLabel(series.status);
  const scheduleLabel = playoffSeriesScheduleLabel(series, props.timezone);
  const visibleFixtures = series.fixtures.filter((fixture) =>
    ['completed', 'settled'].includes(series.status)
      ? ['settled', 'forfeit'].includes(fixture.status)
      : fixture.status !== 'cancelled',
  );
  const fixtureGroups = groupFixturesByGameDay(visibleFixtures, props.timezone);
  const isCompleted = ['completed', 'settled'].includes(series.status);
  return (
    <AccessibleModal
      title={title}
      onClose={props.onClose}
      cardClassName="tournament-bracket-series-modal"
      headerAction={
        <button type="button" className="icon-btn" aria-label="Закрыть" onClick={props.onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      }
    >
      <div className="tournament-bracket-series-modal__meta">
        <strong>{isCompleted ? scheduleLabel : statusLabel}</strong>
        {!isCompleted && scheduleLabel !== statusLabel && <span>{scheduleLabel}</span>}
      </div>
      <div className="tournament-bracket-series-modal__players">
        {players.map((player, index) => {
          return (
            <div
              className="tournament-bracket-series-modal__player"
              key={player.userId ?? `${index}-${player.name ?? 'pending'}`}
            >
              <div className="tournament-bracket-series-modal__identity">
                {player.seed !== null && (
                  <span
                    className="tournament-bracket-series-modal__seed"
                    aria-label={`Посев ${player.seed}`}
                  >
                    {player.seed}
                  </span>
                )}
                <UserAvatar
                  avatarUrl={player.avatarUrl}
                  name={player.name}
                  size={30}
                  alt={player.name ?? 'Участник'}
                />
                <strong className="tournament-bracket-series-modal__name">
                  {player.name ?? 'Участник определится позже'}
                </strong>
              </div>
              <strong aria-label={`${player.wins} побед в серии`}>{player.wins}</strong>
            </div>
          );
        })}
      </div>
      <strong className="tournament-bracket-series-modal__score">
        Счёт серии {series.higher_seed_wins}:{series.lower_seed_wins}
      </strong>
      <div className="tournament-bracket-series__games">
        {visibleFixtures.length === 0 ? (
          <span className="tournament-bracket-series-modal__empty">
            Игры серии ещё не назначены.
          </span>
        ) : (
          fixtureGroups.map((group, groupIndex) => (
            <section className="tournament-bracket-game-day" key={`${group.startsAt}-${groupIndex}`}>
              <strong className="tournament-bracket-game-day__title">
                {gameDayLabel(group.startsAt, props.timezone)}
              </strong>
              <div className="tournament-bracket-game-day__fixtures">
                {group.fixtures.map((fixture) => {
                  const resultLabel = gameResultLabel(fixture);
                  const ariaResultLabel =
                    fixture.status === 'forfeit'
                      ? resultLabel
                      : fixture.homeName !== null &&
                          fixture.awayName !== null &&
                          fixture.homeScore !== null &&
                          fixture.awayScore !== null
                        ? `${fixture.homeName} ${fixture.homeScore}:${fixture.awayScore} ${fixture.awayName}`
                        : null;
                  return (
                    <div
                      className={`tournament-bracket-game${resultLabel === null ? '' : ' tournament-bracket-game--played'}`}
                      key={fixture.id}
                      aria-label={
                        ariaResultLabel === null
                          ? undefined
                          : `Игра ${fixture.gameNumber}: ${ariaResultLabel}`
                      }
                    >
                      <span>Игра {fixture.gameNumber}</span>
                      {resultLabel !== null && (
                        <strong className="tournament-bracket-game__result">
                          {fixture.status === 'forfeit' ? (
                            <span className="tournament-bracket-game__technical-result">
                              {resultLabel}
                            </span>
                          ) : (
                            <span className="tournament-bracket-game__matchup">
                              {fixture.homeName} — {fixture.awayName} {fixture.homeScore}:
                              {fixture.awayScore}
                            </span>
                          )}
                        </strong>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
      {props.renderSeriesAction?.(series)}
    </AccessibleModal>
  );
}

export function TournamentPlayoffBracket({
  tournamentId,
  currentUserId,
  onOpenFixture,
  series,
  timezone,
  formats,
  renderSeriesAction,
}: TournamentPlayoffBracketProps) {
  const championship = series.filter((item) => item.kind === 'championship');
  const seriesNumbers = playoffSeriesNumberMaps(championship);
  const finalRound = Math.max(...championship.map((item) => item.round_number));
  const byKey = new Map(
    series.flatMap((item) =>
      item.depends_on?.key ? ([[item.depends_on.key, item]] as const) : [],
    ),
  );
  const rounds = [...new Set(championship.map((item) => item.round_number))].sort(
    (left, right) => left - right,
  );
  const bronze = series.filter((item) => item.kind === 'third_place');
  const roundViews = rounds.map((roundNumber) => {
    const roundSeries = championship.filter((item) => item.round_number === roundNumber);
    return {
      key: `round-${roundNumber}`,
      label: playoffStageName(roundNumber, finalRound, true),
      roundNumber,
      series: roundSeries,
      bronze: false,
    };
  });
  if (bronze.length > 0) {
    roundViews.push({
      key: 'bronze',
      label: 'За 3-е место',
      roundNumber: finalRound,
      series: bronze,
      bronze: true,
    });
  }
  const [selectedKey, setSelectedKey] = useState('overview');
  const [selectedSeries, setSelectedSeries] = useState<PlayoffSeriesSelection | null>(null);
  const selectedView = roundViews.find((view) => view.key === selectedKey) ?? null;
  const tabs = [{ key: 'overview', label: 'Сетка', roundNumber: 0, bronze: false }, ...roundViews];

  return (
    <div className="tournament-bracket">
      {tabs.length > 1 && (
        <div className="tournament-bracket__round-tabs" role="tablist" aria-label="Раунды плей-офф">
          {tabs.map((view) => (
            <button
              type="button"
              role="tab"
              aria-selected={view.key === selectedKey}
              className={[
                view.roundNumber === finalRound && !view.bronze
                  ? 'tournament-bracket__round-tab--gold'
                  : '',
                view.bronze ? 'tournament-bracket__round-tab--bronze' : '',
                view.key === selectedKey ? 'is-active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setSelectedKey(view.key)}
              key={view.key}
            >
              {view.label}
            </button>
          ))}
        </div>
      )}
      {selectedKey === 'overview' ? (
        <TournamentPlayoffOverview
          series={series}
          currentUserId={currentUserId}
          timezone={timezone}
          {...(formats === undefined ? {} : { formats })}
          onOpenSeries={setSelectedSeries}
        />
      ) : (
        selectedView && (
          <section
            className={`tournament-bracket-round${selectedView.bronze ? ' tournament-bracket-round--bronze' : ''}`}
          >
            <h3>{selectedView.label}</h3>
            <p className="tournament-rules__muted">
              Формат игры:{' '}
              {(() => {
                const configured = formats?.find(
                  (format) => format.roundNumber === selectedView.roundNumber,
                );
                return configured === undefined
                  ? 'будет объявлен перед стартом'
                  : playoffFormatLabel(configured.duelKind);
              })()}
            </p>
            <div>
              {selectedView.series.map((item) => {
                const title = selectedView.bronze
                  ? 'За 3-е место'
                  : playoffSeriesTitle(
                      seriesNumbers.byId.get(item.id) ?? item.bracket_position,
                      item.wins_required,
                    );
                return (
                  <SeriesCard
                    key={item.id}
                    currentUserId={currentUserId}
                    series={item}
                    title={title}
                    byKey={byKey}
                    finalRound={finalRound}
                    seriesNumberByKey={seriesNumbers.byKey}
                    timezone={timezone}
                    bronze={selectedView.bronze}
                    onOpen={() => setSelectedSeries({ series: item, title })}
                  />
                );
              })}
            </div>
          </section>
        )
      )}
      {selectedSeries !== null && (
        <SeriesDetailsModal
          selection={selectedSeries}
          tournamentId={tournamentId}
          currentUserId={currentUserId}
          timezone={timezone}
          onOpenFixture={onOpenFixture}
          onClose={() => setSelectedSeries(null)}
          {...(renderSeriesAction === undefined ? {} : { renderSeriesAction })}
        />
      )}
    </div>
  );
}
