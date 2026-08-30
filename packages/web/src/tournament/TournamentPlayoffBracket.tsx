import { useState } from 'react';
import type {
  TournamentBracketFixture,
  TournamentBracketSeries,
  TournamentBracketSource,
} from '../api/tournament.js';
import { UserAvatar } from '../chat/components/UserAvatar.js';

interface TournamentPlayoffBracketProps {
  series: TournamentBracketSeries[];
  timezone: string;
  formats?: Array<{
    roundNumber: number;
    duelKind: 'express' | 'express_plus' | 'classic';
  }>;
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
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function TournamentPlayoffBracket({
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
