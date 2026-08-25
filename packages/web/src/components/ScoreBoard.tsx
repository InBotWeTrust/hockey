export type GameScoreboardMetricTone = 'default' | 'timer' | 'muted' | 'danger';
export type GameScoreboardMetricEmphasis = 'default' | 'large' | 'small';

export interface GameScoreboardMetric {
  id: string;
  label: string;
  value: string;
  tone?: GameScoreboardMetricTone;
  emphasis?: GameScoreboardMetricEmphasis;
}

export interface GameScoreboardRow {
  id: string;
  metrics: readonly GameScoreboardMetric[];
  variant?: 'primary' | 'secondary';
}

export interface GameScoreboardStatusLine {
  id: string;
  label: string;
  value: string;
  avatarUrl?: string | null;
  tone?: 'active' | 'muted' | 'danger';
}

export interface GameScoreboardModel {
  rows: readonly GameScoreboardRow[];
  statusLine?: GameScoreboardStatusLine;
  notice?: string;
}

export interface GameScoreboardProps extends GameScoreboardModel {
  ariaLabel?: string;
}

export interface ScoreBoardProps {
  period: number;
  periodsTotal?: number;
  timer: string;
  timerLabel?: string | undefined;
  goals: number;
  shots: number;
  shotsTotal?: number | undefined;
  notice?: string | undefined;
  opponent?: ScoreBoardOpponent | undefined;
}

export interface ScoreBoardOpponent {
  name: string;
  avatarUrl: string | null;
  goals: number;
  shots: number;
  shotsLabel?: string | undefined;
  time: string;
  timeTone?: 'active' | 'muted' | 'danger';
}

interface BuildGameScoreboardModelArgs extends ScoreBoardProps {
  scoreLabel?: string;
}

function padded(value: number): string {
  return String(value).padStart(2, '0');
}

export function buildGameScoreboardModel({
  period,
  periodsTotal = 3,
  timer,
  timerLabel = 'ВРЕМЯ',
  goals,
  shots,
  shotsTotal,
  notice,
  opponent,
  scoreLabel = 'ГОЛЫ',
}: BuildGameScoreboardModelArgs): GameScoreboardModel {
  const periodMetric: GameScoreboardMetric = {
    id: 'period',
    label: 'ПЕРИОД',
    value: `${period}/${periodsTotal}`,
  };
  const timerMetric: GameScoreboardMetric = {
    id: 'timer',
    label: timerLabel,
    value: timer,
    tone: 'timer',
  };
  const shotsMetric: GameScoreboardMetric = {
    id: 'shots',
    label: 'БРОСКИ',
    value:
      typeof shotsTotal === 'number' ? `${padded(shots)}/${padded(shotsTotal)}` : padded(shots),
  };
  const scoreMetric: GameScoreboardMetric = {
    id: opponent ? 'score' : 'goals',
    label: opponent ? 'СЧЁТ' : scoreLabel,
    value: opponent ? `${goals}:${opponent.goals}` : padded(goals),
  };
  const statusLine: GameScoreboardStatusLine | undefined = opponent
    ? {
        id: 'opponent',
        label: opponent.name,
        value: `${opponent.shotsLabel ?? String(opponent.shots)} · ${opponent.time.toUpperCase()}`,
        avatarUrl: opponent.avatarUrl,
        tone: opponent.timeTone ?? 'muted',
      }
    : undefined;

  const rows: GameScoreboardRow[] = [
    {
      id: 'summary',
      metrics: [periodMetric, scoreMetric, shotsMetric, timerMetric],
    },
  ];

  return {
    rows,
    ...(statusLine !== undefined ? { statusLine } : {}),
    ...(notice !== undefined ? { notice } : {}),
  };
}

export function GameScoreboard({
  rows,
  statusLine,
  notice,
  ariaLabel = 'Игровое табло',
}: GameScoreboardProps): JSX.Element {
  return (
    <section className="game-scoreboard" aria-label={ariaLabel}>
      <div className="game-scoreboard__rows">
        {rows.map((row) => (
          <div
            key={row.id}
            className={`game-scoreboard__row${
              row.variant === 'secondary' ? ' game-scoreboard__row--secondary' : ''
            }${row.metrics.length >= 4 ? ' game-scoreboard__row--dense' : ''}`}
            data-testid={`scoreboard-row-${row.id}`}
            style={{ gridTemplateColumns: `repeat(${row.metrics.length}, minmax(0, 1fr))` }}
          >
            {row.metrics.map((metric) => {
              const tone = metric.tone ?? 'default';
              const emphasis = metric.emphasis ?? 'default';
              return (
                <div
                  key={metric.id}
                  className={`game-scoreboard__metric game-scoreboard__metric--${tone} game-scoreboard__metric--${emphasis}`}
                >
                  <span className="game-scoreboard__label">{metric.label}</span>
                  <span className="game-scoreboard__value">{metric.value}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {statusLine && (
        <div
          className={`game-scoreboard__status-line game-scoreboard__status-line--${statusLine.tone ?? 'muted'}`}
          aria-label={`${statusLine.id === 'opponent' ? 'Соперник' : 'Статус'}: ${statusLine.label}`}
        >
          {statusLine.avatarUrl ? (
            <img className="game-scoreboard__status-avatar" src={statusLine.avatarUrl} alt="" />
          ) : (
            <span className="game-scoreboard__status-avatar-fallback" aria-hidden="true">
              {statusLine.label.trim().charAt(0).toUpperCase() || '?'}
            </span>
          )}
          <span className="game-scoreboard__status-label">{statusLine.label}</span>
          <span className="game-scoreboard__status-value">{statusLine.value}</span>
        </div>
      )}
      {notice && <div className="game-scoreboard__notice">{notice}</div>}
    </section>
  );
}

/**
 * Compatibility adapter for the legacy direct rink. Shared PlayView uses the
 * same model builder and presentational component.
 */
export function ScoreBoard(props: ScoreBoardProps): JSX.Element {
  const model = buildGameScoreboardModel({
    ...props,
    scoreLabel: props.opponent ? 'СЧЁТ' : 'ШАЙБЫ',
  });
  return <GameScoreboard {...model} />;
}
