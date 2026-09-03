import { useState, type CSSProperties } from 'react';
import type { TournamentBracketSeries, TournamentBracketSource } from '../api/tournament.js';
import { UserAvatar } from '../chat/components/UserAvatar.js';

export interface PlayoffSeriesSelection {
  series: TournamentBracketSeries;
  title: string;
}

interface PlayoffFormat {
  roundNumber: number;
  duelKind: 'express' | 'express_plus' | 'classic';
}

export function playoffFormatLabel(kind: PlayoffFormat['duelKind']): string {
  if (kind === 'express') return 'Экспресс';
  if (kind === 'express_plus') return 'Микс';
  return 'Классика';
}

export function playoffStageName(roundNumber: number, finalRound: number, plural: boolean): string {
  const distance = finalRound - roundNumber;
  if (distance === 0) return 'Финал';
  if (distance === 1) return plural ? 'Полуфиналы' : 'Полуфинал';
  if (distance === 2) return plural ? 'Четвертьфиналы' : 'Четвертьфинал';
  if (distance === 3) return '1/8 финала';
  if (distance === 4) return '1/16 финала';
  return `Раунд ${roundNumber}`;
}

export function playoffSeriesTitle(gameNumber: number, winsRequired: number): string {
  return `${winsRequired > 1 ? 'Серия' : 'Игра'} ${gameNumber}`;
}

export function playoffSeriesNumberMaps(series: TournamentBracketSeries[]): {
  byId: Map<string, number>;
  byKey: Map<string, number>;
} {
  const ordered = [...series].sort(
    (left, right) =>
      left.round_number - right.round_number || left.bracket_position - right.bracket_position,
  );
  const byId = new Map<string, number>();
  const byKey = new Map<string, number>();
  ordered.forEach((item, index) => {
    const gameNumber = index + 1;
    byId.set(item.id, gameNumber);
    if (item.depends_on?.key) byKey.set(item.depends_on.key, gameNumber);
  });
  return { byId, byKey };
}

export function playoffParticipantPlaceholder(
  source: TournamentBracketSource | undefined,
  byKey: Map<string, TournamentBracketSeries>,
  finalRound: number,
  seriesNumberByKey?: Map<string, number>,
): string {
  if (source?.type !== 'winner' && source?.type !== 'loser') return 'Участник определится позже';
  const sourceSeries = source.seriesKey ? byKey.get(source.seriesKey) : undefined;
  if (!sourceSeries) {
    return source.type === 'winner'
      ? 'Победитель предыдущей серии'
      : 'Проигравший предыдущей серии';
  }
  const prefix = source.type === 'winner' ? 'Победитель' : 'Проигравший';
  const gameNumber = source.seriesKey ? seriesNumberByKey?.get(source.seriesKey) : undefined;
  if (gameNumber !== undefined) return `${prefix} ${gameNumber}`;
  const distance = finalRound - sourceSeries.round_number;
  const sourceStage =
    distance === 1
      ? 'полуфинала'
      : distance === 2
        ? 'четвертьфинала'
        : distance === 3
          ? '1/8 финала'
          : distance === 4
            ? '1/16 финала'
            : `серии раунда ${sourceSeries.round_number}`;
  return `${prefix} ${sourceStage} ${sourceSeries.bracket_position}`;
}

function dateParts(value: Date, timezone: string): { day: string; month: string; key: string } {
  return {
    day: new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, day: 'numeric' }).format(value),
    month: new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, month: 'long' }).format(value),
    key: new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value),
  };
}

function dateLabel(value: Date, timezone: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    day: 'numeric',
    month: 'long',
  }).format(value);
}

function shortMonthLabel(value: Date, timezone: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, month: 'short' })
    .format(value)
    .replace(/^сент\.$/, 'сен.');
}

function nextGameLabel(value: Date, timezone: string, now: Date): string {
  const target = dateParts(value, timezone);
  const today = dateParts(now, timezone);
  const date = target.key === today.key ? 'сегодня' : dateLabel(value, timezone);
  const time = new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
  return `Следующая: ${date}, ${time}`;
}

export function playoffSeriesScheduleLabel(
  series: TournamentBracketSeries,
  timezone: string,
  now = new Date(),
  compact = false,
): string {
  const scheduled = series.fixtures
    .map((fixture) => ({ fixture, date: new Date(fixture.scheduledStartsAt ?? '') }))
    .filter(({ date }) => Number.isFinite(date.getTime()))
    .sort((left, right) => left.date.getTime() - right.date.getTime());

  if (['completed', 'settled'].includes(series.status)) {
    const lastCompleted = [...scheduled]
      .reverse()
      .find(({ fixture }) => ['settled', 'forfeit'].includes(fixture.status));
    return lastCompleted ? `Завершена ${dateLabel(lastCompleted.date, timezone)}` : 'Завершена';
  }

  if (series.status === 'active') {
    const next = scheduled.find(
      ({ fixture, date }) =>
        !['settled', 'forfeit', 'cancelled'].includes(fixture.status) &&
        date.getTime() >= now.getTime(),
    );
    return next ? nextGameLabel(next.date, timezone, now) : 'Идёт серия';
  }

  if (scheduled.length === 0) return 'Расписание уточняется';
  const first = scheduled[0]!.date;
  const last = scheduled.at(-1)!.date;
  const firstParts = dateParts(first, timezone);
  const lastParts = dateParts(last, timezone);
  if (firstParts.key === lastParts.key) return dateLabel(first, timezone);
  if (firstParts.month === lastParts.month) {
    if (compact) return `${firstParts.day}–${lastParts.day} ${shortMonthLabel(last, timezone)}`;
    const inflectedMonth = dateLabel(last, timezone).replace(/^\d+\s+/, '');
    return `${firstParts.day}–${lastParts.day} ${inflectedMonth}`;
  }
  if (compact) {
    return `${firstParts.day} ${shortMonthLabel(first, timezone)} – ${lastParts.day} ${shortMonthLabel(last, timezone)}`;
  }
  return `${dateLabel(first, timezone)} — ${dateLabel(last, timezone)}`;
}

function winLabel(wins: number): string {
  if (wins % 10 === 1 && wins % 100 !== 11) return 'победа';
  if ([2, 3, 4].includes(wins % 10) && ![12, 13, 14].includes(wins % 100)) return 'победы';
  return 'побед';
}

export function PlayoffParticipantRow(props: {
  name: string | null;
  avatarUrl: string | null;
  seed: number | null;
  placeholder: string;
  winner: boolean;
  current: boolean;
  wins: number;
  compact: boolean;
  density?: 2 | 3 | 4;
}) {
  const name = props.name ?? props.placeholder;
  if (props.name === null) {
    return (
      <div className="tournament-bracket-player tournament-bracket-player--pending">
        <strong className="tournament-bracket-player__placeholder">{props.placeholder}</strong>
      </div>
    );
  }
  return (
    <div
      className={[
        'tournament-bracket-player',
        props.winner ? 'tournament-bracket-player--winner' : '',
        props.current ? 'tournament-bracket-player--current' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span
        className="tournament-bracket-player__seed"
        aria-label={`Посев ${props.seed ?? 'не определён'}`}
      >
        {props.seed ?? '—'}
      </span>
      <UserAvatar
        avatarUrl={props.avatarUrl}
        name={name}
        size={props.compact ? (props.density === 4 ? 16 : props.density === 3 ? 18 : 22) : 32}
        alt={props.name}
      />
      <div className="tournament-bracket-player__identity">
        <strong>{name}</strong>
      </div>
      <strong
        className="tournament-bracket-player__wins"
        aria-label={`${props.wins} ${winLabel(props.wins)} в серии`}
      >
        {props.wins}
      </strong>
    </div>
  );
}

export function PlayoffSeriesCard(props: {
  series: TournamentBracketSeries;
  title: string;
  stageLabel?: string;
  byKey: Map<string, TournamentBracketSeries>;
  finalRound: number;
  seriesNumberByKey?: Map<string, number>;
  currentUserId: string | null;
  timezone: string;
  bronze?: boolean;
  compact?: boolean;
  density?: 2 | 3 | 4;
  onOpen: () => void;
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
  return (
    <article
      className={[
        'tournament-bracket-series',
        isMySeries ? 'tournament-bracket-series--mine' : '',
        props.bronze ? 'tournament-bracket-series--bronze' : '',
        props.compact ? 'tournament-bracket-series--compact' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className="tournament-bracket-series__summary"
        aria-label={`Открыть серию ${props.stageLabel ? `${props.stageLabel}, ` : ''}${props.title}`}
        onClick={props.onOpen}
      >
        <header className={props.stageLabel ? 'tournament-bracket-series__staged-header' : ''}>
          <strong className={props.stageLabel ? 'tournament-bracket-series__staged-title' : ''}>
            {props.stageLabel ? (
              <small className="tournament-bracket-series__stage-label">
                {props.stageLabel}
              </small>
            ) : null}
            {props.title}
          </strong>
          <span>
            {playoffSeriesScheduleLabel(
              props.series,
              props.timezone,
              new Date(),
              props.compact === true,
            )}
          </span>
        </header>
        <div className="tournament-bracket-series__players">
          <PlayoffParticipantRow
            name={props.series.higher_name}
            avatarUrl={props.series.higher_avatar_url}
            seed={props.series.higher_seed}
            placeholder={playoffParticipantPlaceholder(
              sources[0],
              props.byKey,
              props.finalRound,
              props.seriesNumberByKey,
            )}
            winner={higherWon}
            current={props.series.higher_user_id === props.currentUserId}
            wins={props.series.higher_seed_wins}
            compact={props.compact === true}
            {...(props.density === undefined ? {} : { density: props.density })}
          />
          <PlayoffParticipantRow
            name={props.series.lower_name}
            avatarUrl={props.series.lower_avatar_url}
            seed={props.series.lower_seed}
            placeholder={playoffParticipantPlaceholder(
              sources[1],
              props.byKey,
              props.finalRound,
              props.seriesNumberByKey,
            )}
            winner={lowerWon}
            current={props.series.lower_user_id === props.currentUserId}
            wins={props.series.lower_seed_wins}
            compact={props.compact === true}
            {...(props.density === undefined ? {} : { density: props.density })}
          />
        </div>
      </button>
    </article>
  );
}

function championFrom(finalSeries: TournamentBracketSeries | undefined) {
  if (!finalSeries?.winner_user_id) return null;
  if (finalSeries.winner_user_id === finalSeries.higher_user_id) {
    return {
      name: finalSeries.higher_name,
      avatarUrl: finalSeries.higher_avatar_url,
      seed: finalSeries.higher_seed,
    };
  }
  if (finalSeries.winner_user_id === finalSeries.lower_user_id) {
    return {
      name: finalSeries.lower_name,
      avatarUrl: finalSeries.lower_avatar_url,
      seed: finalSeries.lower_seed,
    };
  }
  return null;
}

export function TournamentPlayoffOverview(props: {
  series: TournamentBracketSeries[];
  currentUserId: string | null;
  timezone: string;
  formats?: PlayoffFormat[];
  onOpenSeries: (selection: PlayoffSeriesSelection) => void;
}) {
  const [visibleColumns, setVisibleColumns] = useState<2 | 3 | 4>(2);
  const championship = props.series.filter((item) => item.kind === 'championship');
  const seriesNumbers = playoffSeriesNumberMaps(championship);
  const rounds = [...new Set(championship.map((item) => item.round_number))].sort(
    (left, right) => left - right,
  );
  const finalRound = rounds.at(-1) ?? 1;
  const byKey = new Map(
    props.series.flatMap((item) =>
      item.depends_on?.key ? ([[item.depends_on.key, item]] as const) : [],
    ),
  );
  const bronze = props.series.filter((item) => item.kind === 'third_place');
  const finalSeries = championship.find((item) => item.round_number === finalRound);
  const champion = championFrom(finalSeries);
  const columnCount = rounds.length + 1;
  const layout = columnCount <= visibleColumns ? 'fit' : 'scroll';
  const style = {
    '--playoff-column-count': columnCount,
    '--playoff-round-count': rounds.length,
  } as CSSProperties;

  return (
    <section
      className="tournament-bracket-overview"
      role="region"
      aria-label="Турнирная сетка"
      data-layout={layout}
      data-visible-columns={visibleColumns}
    >
      <div className="tournament-bracket-overview__heading-row">
        <h3>Турнирная сетка</h3>
        <div
          className="tournament-bracket-overview__density"
          role="group"
          aria-label="Раундов на экране"
        >
          {([2, 3, 4] as const).map((count) => (
            <button
              type="button"
              aria-pressed={visibleColumns === count}
              onClick={() => setVisibleColumns(count)}
              key={count}
            >
              {count}
            </button>
          ))}
        </div>
      </div>
      <div className="tournament-bracket-overview__viewport">
        <div className="tournament-bracket-overview__grid" style={style}>
          {rounds.map((roundNumber) => {
            const items = championship.filter((item) => item.round_number === roundNumber);
            const configured = props.formats?.find((format) => format.roundNumber === roundNumber);
            return (
              <section className="tournament-bracket-overview__column" key={roundNumber}>
                <header>
                  <strong>{playoffStageName(roundNumber, finalRound, true)}</strong>
                  <span>
                    {configured ? playoffFormatLabel(configured.duelKind) : 'Формат уточняется'}
                  </span>
                </header>
                <div
                  className={[
                    'tournament-bracket-overview__series-list',
                    roundNumber === finalRound && bronze.length > 0
                      ? 'tournament-bracket-overview__series-list--with-bronze'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-series-count={items.length}
                >
                  {items.map((item) => {
                    const title = playoffSeriesTitle(
                      seriesNumbers.byId.get(item.id) ?? item.bracket_position,
                      item.wins_required,
                    );
                    const stageLabel = roundNumber === finalRound ? 'Финал' : undefined;
                    return (
                      <PlayoffSeriesCard
                        key={item.id}
                        series={item}
                        title={title}
                        {...(stageLabel === undefined ? {} : { stageLabel })}
                        byKey={byKey}
                        finalRound={finalRound}
                        seriesNumberByKey={seriesNumbers.byKey}
                        currentUserId={props.currentUserId}
                        timezone={props.timezone}
                        compact
                        density={visibleColumns}
                        onOpen={() =>
                          props.onOpenSeries({
                            series: item,
                            title: stageLabel ? `${stageLabel} · ${title}` : title,
                          })
                        }
                      />
                    );
                  })}
                  {roundNumber < finalRound &&
                    Array.from({ length: Math.floor(items.length / 2) }, (_, pairIndex) => {
                      const top = ((pairIndex * 2 + 0.5) / items.length) * 100;
                      const height = (1 / items.length) * 100;
                      return (
                        <span
                          aria-hidden="true"
                          className="tournament-bracket-connector"
                          key={`connector-${pairIndex}`}
                          style={{ top: `${top}%`, height: `${height}%` }}
                        />
                      );
                    })}
                  {roundNumber === finalRound &&
                    bronze.map((item, index) => {
                      const title = playoffSeriesTitle(
                        championship.length + index + 1,
                        item.wins_required,
                      );
                      return (
                      <div className="tournament-bracket-overview__bronze-lane" key={item.id}>
                        <PlayoffSeriesCard
                          series={item}
                          title={title}
                          stageLabel="За 3-е место"
                          byKey={byKey}
                          finalRound={finalRound}
                          seriesNumberByKey={seriesNumbers.byKey}
                          currentUserId={props.currentUserId}
                          timezone={props.timezone}
                          bronze
                          compact
                          density={visibleColumns}
                          onOpen={() =>
                            props.onOpenSeries({ series: item, title: `За 3-е место · ${title}` })
                          }
                        />
                      </div>
                      );
                    })}
                </div>
              </section>
            );
          })}
          <section className="tournament-bracket-overview__column tournament-bracket-overview__champion-column">
            <header>
              <strong>Итог</strong>
              <span>Победитель турнира</span>
            </header>
            <article className="tournament-bracket-champion">
              <strong>Чемпион</strong>
              {champion?.name ? (
                <div className="tournament-bracket-champion__player">
                  <span aria-label={`Посев ${champion.seed ?? 'не определён'}`}>
                    {champion.seed ?? '—'}
                  </span>
                  <UserAvatar
                    avatarUrl={champion.avatarUrl}
                    name={champion.name}
                    size={layout === 'fit' ? 24 : 36}
                    alt={champion.name}
                  />
                  <strong>{champion.name}</strong>
                </div>
              ) : (
                <span>Определится в финале</span>
              )}
            </article>
          </section>
        </div>
      </div>
    </section>
  );
}
