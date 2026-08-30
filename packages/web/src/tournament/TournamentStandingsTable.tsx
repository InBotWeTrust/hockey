function displayNumber(rawValue: unknown, maximumFractionDigits = 2): string {
  const parsed = Number(rawValue);
  const value = Number.isFinite(parsed) ? parsed : 0;
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits }).format(value);
}

function resultColumn(regularSource: string, dailyMetric: string | null) {
  if (regularSource !== 'head_to_head' && dailyMetric === 'accuracy_average') {
    return {
      heading: 'Точность',
      value: (row: Record<string, unknown>) => `${displayNumber(Number(row.points) * 100, 1)}%`,
    };
  }
  if (regularSource !== 'head_to_head' && dailyMetric === 'daily_place_points') {
    return { heading: 'Очки', value: (row: Record<string, unknown>) => displayNumber(row.points) };
  }
  return {
    heading: 'Шайбы',
    value: (row: Record<string, unknown>) =>
      displayNumber(regularSource === 'head_to_head' ? row.goals_for : row.points, 0),
  };
}

export function TournamentStandingsTable(props: {
  rows: Array<Record<string, unknown>>;
  regularSource: string;
  dailyMetric: string | null;
  playoffSize?: number | null;
  currentUserId?: string | null;
  onPlayerClick?: (row: Record<string, unknown>) => void;
  resultHeading?: string;
  variant?: 'default' | 'duel-rating';
}) {
  const result = resultColumn(props.regularSource, props.dailyMetric);
  const playoffSize = Math.max(0, Math.floor(Number(props.playoffSize) || 0));
  const isDuelRating = props.variant === 'duel-rating';
  return (
    <table
      className={`tournament-standing-table${isDuelRating ? ' tournament-standing-table--duel-rating' : ''}`}
    >
      <thead>
        <tr>
          <th scope="col">{isDuelRating ? 'М' : 'Место'}</th>
          <th scope="col">Игрок</th>
          <th scope="col">{isDuelRating ? 'И' : 'Игры'}</th>
          {isDuelRating ? (
            <>
              <th scope="col">В</th>
              <th scope="col">Н</th>
              <th scope="col">П</th>
            </>
          ) : null}
          <th scope="col">{isDuelRating ? 'О' : (props.resultHeading ?? result.heading)}</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row, index) => {
          const playerName = String(row.display_name ?? `Участник ${index + 1}`);
          const rank = Number(row.rank ?? index + 1);
          const userId = String(row.user_id ?? '');
          const isPlayoffPlace = playoffSize > 0 && Number.isFinite(rank) && rank <= playoffSize;
          const isCurrentUser = props.currentUserId === userId;
          const medalClass =
            isDuelRating && !isCurrentUser
              ? rank === 1
                ? 'tournament-standing-table__medal-place--gold'
                : rank === 2
                  ? 'tournament-standing-table__medal-place--silver'
                  : rank === 3
                    ? 'tournament-standing-table__medal-place--bronze'
                    : ''
              : '';
          return (
            <tr
              key={String(row.user_id ?? index)}
              className={[
                isPlayoffPlace ? 'tournament-standing-table__playoff-place' : '',
                isCurrentUser ? 'tournament-standing-table__current-user' : '',
                medalClass,
              ]
                .filter(Boolean)
                .join(' ') || undefined}
            >
              <td>{displayNumber(row.rank ?? index + 1, 0)}</td>
              <td>
                <button
                  type="button"
                  className="tournament-standing-player tournament-standing-player--button"
                  aria-label={`Открыть профиль ${playerName}`}
                  disabled={!props.onPlayerClick}
                  onClick={() => props.onPlayerClick?.(row)}
                >
                  <UserAvatar
                    avatarUrl={typeof row.avatar_url === 'string' ? row.avatar_url : null}
                    name={playerName}
                    size={isDuelRating ? 24 : 28}
                    fontSize={isDuelRating ? 10 : 11}
                    alt={playerName}
                    style={{ background: 'rgba(30, 91, 151, 0.13)', color: '#244d73' }}
                  />
                  <span title={playerName}>{playerName}</span>
                </button>
              </td>
              <td>{displayNumber(row.played, 0)}</td>
              {isDuelRating ? (
                <>
                  <td>{displayNumber(row.wins, 0)}</td>
                  <td>{displayNumber(row.draws, 0)}</td>
                  <td>{displayNumber(row.losses, 0)}</td>
                </>
              ) : null}
              <td>{result.value(row)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
import { UserAvatar } from '../chat/components/UserAvatar.js';
