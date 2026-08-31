import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  chooseTournamentNextGame,
  fetchTournamentFixtureAttempt,
} from '../api/tournament.js';
import type {
  TournamentBracketFixture,
  TournamentBracketSeries,
  TournamentBracketSource,
  TournamentFixtureAttemptState,
} from '../api/tournament.js';
import { UserAvatar } from '../chat/components/UserAvatar.js';

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
  onChooseNextGame: (choice: 'immediate' | 'scheduled') => void;
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
  const nextChoiceRemaining = useRemaining(state.nextGameChoice?.expiresAt ?? null);
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
          {readinessRemaining !== null && (
            <span>До закрытия готовности {readinessRemaining}</span>
          )}
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
          <strong>Игра по расписанию</strong>
          <span>Подтверждение готовности откроется перед началом.</span>
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
      {state.nextGameChoice?.canChoose && (
        <div className="tournament-playoff-attempt__choice">
          <strong>Следующая игра</strong>
          <span>В течение минуты выберите, готовы ли вы сыграть ещё раз сразу.</span>
          {nextChoiceRemaining !== null && <span>Осталось на решение {nextChoiceRemaining}</span>}
          <div>
            <button
              type="button"
              className="btn btn--cta"
              onClick={() => props.onChooseNextGame('immediate')}
            >
              Сыграть сразу
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => props.onChooseNextGame('scheduled')}
            >
              По расписанию
            </button>
          </div>
        </div>
      )}
      {state.nextGameChoice !== null && !state.nextGameChoice.canChoose && (
        <span>
          {state.nextGameChoice.startsImmediately
            ? 'Оба игрока готовы — следующая игра начинается.'
            : state.nextGameChoice.myChoice === 'immediate'
              ? 'Вы готовы сыграть сразу. Ждём решение соперника.'
              : 'Следующая игра остаётся в расписании.'}
        </span>
      )}
      {wonSeries ? (
        <strong className="tournament-playoff-attempt__series-win">
          Вы выиграли серию {state.series!.myWins} : {state.series!.opponentWins}
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

function PlayerAttemptState(props: {
  tournamentId: string;
  fixtureId: string;
  currentUserId: string;
  timezone: string;
  onOpenFixture: (fixtureId: string) => void;
}) {
  const queryClient = useQueryClient();
  const queryKey = ['tournaments', props.tournamentId, 'fixtures', props.fixtureId, 'attempt'];
  const attempt = useQuery({
    queryKey,
    queryFn: () => fetchTournamentFixtureAttempt(props.tournamentId, props.fixtureId),
    refetchInterval: 5_000,
  });
  const choice = useMutation({
    mutationFn: (value: 'immediate' | 'scheduled') =>
      chooseTournamentNextGame(props.tournamentId, props.fixtureId, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  if (!attempt.data) return null;
  return (
    <>
      <TournamentPlayoffAttemptView
        state={attempt.data}
        currentUserId={props.currentUserId}
        timezone={props.timezone}
        onOpenGame={() => props.onOpenFixture(props.fixtureId)}
        onChooseNextGame={(value) => choice.mutate(value)}
      />
      {choice.isError && (
        <span className="tournament-fixture-card__error" role="alert">
          Не удалось сохранить решение. Попробуйте ещё раз.
        </span>
      )}
    </>
  );
}

function formatLabel(kind: 'express' | 'express_plus' | 'classic'): string {
  if (kind === 'express') return 'Экспресс';
  if (kind === 'express_plus') return 'Микс';
  return 'Классика';
}

function stageName(roundNumber: number, finalRound: number, plural: boolean): string {
  const distance = finalRound - roundNumber;
  if (distance === 0) return 'Финал';
  if (distance === 1) return plural ? 'Полуфиналы' : 'Полуфинал';
  if (distance === 2) return plural ? 'Четвертьфиналы' : 'Четвертьфинал';
  if (distance === 3) return '1/8 финала';
  return plural ? `Раунд ${roundNumber}` : `Игра раунда ${roundNumber}`;
}

function sourceStageName(roundNumber: number, finalRound: number): string {
  const distance = finalRound - roundNumber;
  if (distance === 1) return 'полуфинала';
  if (distance === 2) return 'четвертьфинала';
  if (distance === 3) return '1/8 финала';
  return `серии раунда ${roundNumber}`;
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

function gameTimeLabel(fixture: TournamentBracketFixture, timezone: string): string {
  if (fixture.scheduledStartsAt === null) return 'Время ещё не назначено';
  const startsAt = new Date(fixture.scheduledStartsAt);
  if (!Number.isFinite(startsAt.getTime())) return 'Время ещё не назначено';
  const date = new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    day: 'numeric',
    month: 'long',
  }).format(startsAt);
  const time = new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  });
  const startTime = time.format(startsAt);
  if (fixture.windowEndsAt === null) return `${date} в ${startTime}`;
  const endsAt = new Date(fixture.windowEndsAt);
  if (!Number.isFinite(endsAt.getTime())) return `${date} в ${startTime}`;
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  if (dateKey.format(startsAt) === dateKey.format(endsAt)) {
    return `${date}, ${startTime}–${time.format(endsAt)}`;
  }
  const endDate = new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    day: 'numeric',
    month: 'long',
  }).format(endsAt);
  return `${date}, ${startTime} — ${endDate}, ${time.format(endsAt)}`;
}

function gameResultLabel(fixture: TournamentBracketFixture): string | null {
  if (!['settled', 'forfeit'].includes(fixture.status)) return null;
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

function participantPlaceholder(
  source: TournamentBracketSource | undefined,
  byKey: Map<string, TournamentBracketSeries>,
  finalRound: number,
): string {
  if (source?.type !== 'winner' && source?.type !== 'loser') return 'Участник определится позже';
  const sourceSeries = source.seriesKey ? byKey.get(source.seriesKey) : undefined;
  if (!sourceSeries) {
    return source.type === 'winner'
      ? 'Победитель предыдущей серии'
      : 'Проигравший предыдущей серии';
  }
  const prefix = source.type === 'winner' ? 'Победитель' : 'Проигравший';
  return `${prefix} ${sourceStageName(sourceSeries.round_number, finalRound)} ${sourceSeries.bracket_position}`;
}

function ParticipantRow(props: {
  name: string | null;
  avatarUrl: string | null;
  seed: number | null;
  placeholder: string;
  winner: boolean;
}) {
  const name = props.name ?? props.placeholder;
  return (
    <div
      className={`tournament-bracket-player${props.name ? '' : ' tournament-bracket-player--pending'}${props.winner ? ' tournament-bracket-player--winner' : ''}`}
    >
      <UserAvatar
        avatarUrl={props.avatarUrl}
        name={name}
        size={32}
        {...(props.name !== null ? { alt: props.name } : {})}
      />
      <div className="tournament-bracket-player__identity">
        <strong>{name}</strong>
        {props.seed !== null && <span>Посев {props.seed}</span>}
      </div>
    </div>
  );
}

function SeriesCard(props: {
  tournamentId: string;
  currentUserId: string | null;
  onOpenFixture: (fixtureId: string) => void;
  series: TournamentBracketSeries;
  title: string;
  byKey: Map<string, TournamentBracketSeries>;
  finalRound: number;
  timezone: string;
}) {
  const sources = props.series.depends_on?.sources ?? [];
  const finished = ['completed', 'settled'].includes(props.series.status);
  const higherWon =
    props.series.winner_user_id !== null
      ? props.series.winner_user_id === props.series.higher_user_id
      : finished && props.series.higher_seed_wins > props.series.lower_seed_wins;
  const lowerWon =
    props.series.winner_user_id !== null
      ? props.series.winner_user_id === props.series.lower_user_id
      : finished && props.series.lower_seed_wins > props.series.higher_seed_wins;
  const isMySeries =
    props.currentUserId !== null &&
    [props.series.higher_user_id, props.series.lower_user_id].includes(props.currentUserId);
  const latestFixtureId = props.series.fixtures.at(-1)?.id ?? null;
  return (
    <article className="tournament-bracket-series">
      <header>
        <strong>{props.title}</strong>
        <span>{seriesStatusLabel(props.series.status)}</span>
      </header>
      <div className="tournament-bracket-series__players">
        <ParticipantRow
          name={props.series.higher_name}
          avatarUrl={props.series.higher_avatar_url}
          seed={props.series.higher_seed}
          placeholder={participantPlaceholder(sources[0], props.byKey, props.finalRound)}
          winner={higherWon}
        />
        <ParticipantRow
          name={props.series.lower_name}
          avatarUrl={props.series.lower_avatar_url}
          seed={props.series.lower_seed}
          placeholder={participantPlaceholder(sources[1], props.byKey, props.finalRound)}
          winner={lowerWon}
        />
      </div>
      {props.series.higher_seed_wins + props.series.lower_seed_wins > 0 && (
        <div className="tournament-bracket-series__score">
          Счёт в серии {props.series.higher_seed_wins} : {props.series.lower_seed_wins}
        </div>
      )}
      {props.series.fixtures.length > 0 && (
        <div className="tournament-bracket-series__games">
          {props.series.fixtures.map((fixture) => (
            <div className="tournament-bracket-game" key={fixture.id}>
              <span>
                Игра {fixture.gameNumber} · {gameTimeLabel(fixture, props.timezone)}
              </span>
              {gameResultLabel(fixture) !== null && (
                <strong
                  className={`tournament-bracket-game__result${fixture.winnerSide ? ` tournament-bracket-game__result--${fixture.winnerSide}-won` : ''}`}
                >
                  {gameResultLabel(fixture)}
                </strong>
              )}
              {isMySeries && fixture.id === latestFixtureId && (
                  <PlayerAttemptState
                    tournamentId={props.tournamentId}
                    fixtureId={fixture.id}
                    currentUserId={props.currentUserId!}
                    timezone={props.timezone}
                    onOpenFixture={props.onOpenFixture}
                  />
                )}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function TournamentPlayoffBracket({
  tournamentId,
  currentUserId,
  onOpenFixture,
  series,
  timezone,
  formats,
}: TournamentPlayoffBracketProps) {
  const championship = series.filter((item) => item.kind === 'championship');
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
      label: stageName(roundNumber, finalRound, true),
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
  const recommendedView =
    roundViews.find((view) =>
      view.series.some((item) => ['active', 'scheduled'].includes(item.status)),
    ) ??
    [...roundViews].reverse().find((view) => !view.bronze) ??
    roundViews[0]!;
  const [selectedKey, setSelectedKey] = useState(recommendedView.key);
  const selectedView = roundViews.find((view) => view.key === selectedKey) ?? recommendedView;

  return (
    <div className="tournament-bracket">
      {roundViews.length > 1 && (
        <div className="tournament-bracket__round-tabs" role="tablist" aria-label="Раунды плей-офф">
          {roundViews.map((view) => (
            <button
              type="button"
              role="tab"
              aria-selected={view.key === selectedView.key}
              className={view.key === selectedView.key ? 'is-active' : undefined}
              onClick={() => setSelectedKey(view.key)}
              key={view.key}
            >
              {view.label}
            </button>
          ))}
        </div>
      )}
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
              : formatLabel(configured.duelKind);
          })()}
        </p>
        <div>
          {selectedView.series.map((item) => (
            <SeriesCard
              key={item.id}
              tournamentId={tournamentId}
              currentUserId={currentUserId}
              onOpenFixture={onOpenFixture}
              series={item}
              title={
                selectedView.bronze
                  ? 'За 3-е место'
                  : `${stageName(selectedView.roundNumber, finalRound, false)}${selectedView.series.length > 1 ? ` ${item.bracket_position}` : ''}`
              }
              byKey={byKey}
              finalRound={finalRound}
              timezone={timezone}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
