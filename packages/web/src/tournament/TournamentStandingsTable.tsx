import type { TournamentRegularSource } from '../api/tournament.js';
import { UserAvatar } from '../chat/components/UserAvatar.js';

function displayNumber(rawValue: unknown, maximumFractionDigits = 2): string {
  const parsed = Number(rawValue);
  const value = Number.isFinite(parsed) ? parsed : 0;
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits }).format(value);
}

function resultColumn(
  regularSource: TournamentRegularSource,
  dailyMetric: string | null,
  isDuelRating: boolean,
  isExperienceRating: boolean,
) {
  if (isExperienceRating) {
    return {
      heading: 'Опыт',
      value: (row: Record<string, unknown>) => displayNumber(row.experience, 0),
    };
  }
  if (isDuelRating) {
    return { heading: 'Очки', value: (row: Record<string, unknown>) => displayNumber(row.points) };
  }
  if (regularSource === 'classic' && dailyMetric === 'accuracy_average') {
    return {
      heading: 'Точность',
      value: (row: Record<string, unknown>) => `${displayNumber(Number(row.points) * 100, 1)}%`,
    };
  }
  if (regularSource === 'classic' && dailyMetric === 'daily_place_points') {
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
  regularSource: TournamentRegularSource;
  dailyMetric: string | null;
  playoffSize?: number | null;
  currentUserId?: string | null;
  onPlayerClick?: (row: Record<string, unknown>) => void;
  resultHeading?: string;
  variant?: 'default' | 'duel-rating' | 'experience-rating';
  currentUserRowRef?: (node: HTMLTableRowElement | null) => void;
  currentUserRowTestId?: string;
  hideHeader?: boolean;
}) {
  const playoffSize = Math.max(0, Math.floor(Number(props.playoffSize) || 0));
  const isDuelRating = props.variant === 'duel-rating';
  const isExperienceRating = props.variant === 'experience-rating';
  const result = resultColumn(
    props.regularSource,
    props.dailyMetric,
    isDuelRating,
    isExperienceRating,
  );
  const variantClass = isDuelRating
    ? ' tournament-standing-table--duel-rating'
    : isExperienceRating
      ? ' tournament-standing-table--experience-rating'
      : '';
  return (
    <table className={`tournament-standing-table${variantClass}`}>
      {!props.hideHeader ? (
        <thead>
          <tr>
            <th scope="col">{isDuelRating ? 'М' : 'Место'}</th>
            <th scope="col">Игрок</th>
            {!isExperienceRating ? <th scope="col">{isDuelRating ? 'И' : 'Игры'}</th> : null}
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
      ) : null}
      <tbody>
        {props.rows.map((row, index) => {
          const playerName = String(row.display_name ?? `Участник ${index + 1}`);
          const rank = Number(row.rank ?? index + 1);
          const userId = String(row.user_id ?? '');
          const isClickable = props.onPlayerClick !== undefined && userId.length > 0;
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
              {...(isCurrentUser && props.currentUserRowRef !== undefined
                ? { ref: props.currentUserRowRef }
                : {})}
              {...(isCurrentUser && props.currentUserRowTestId !== undefined
                ? { 'data-testid': props.currentUserRowTestId }
                : {})}
              className={
                [
                  isPlayoffPlace ? 'tournament-standing-table__playoff-place' : '',
                  isCurrentUser ? 'tournament-standing-table__current-user' : '',
                  medalClass,
                  isClickable ? 'tournament-standing-table__clickable-row' : '',
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              onClick={isClickable ? () => props.onPlayerClick?.(row) : undefined}
            >
              <td>{displayNumber(row.rank ?? index + 1, 0)}</td>
              <td>
                <button
                  type="button"
                  className="tournament-standing-player tournament-standing-player--button"
                  aria-label={`Открыть профиль ${playerName}`}
                  disabled={!isClickable}
                >
                  <UserAvatar
                    avatarUrl={typeof row.avatar_url === 'string' ? row.avatar_url : null}
                    name={playerName}
                    size={isDuelRating || isExperienceRating ? 24 : 28}
                    fontSize={isDuelRating || isExperienceRating ? 10 : 11}
                    alt={playerName}
                    style={{ background: 'rgba(30, 91, 151, 0.13)', color: '#244d73' }}
                  />
                  <span title={playerName}>{playerName}</span>
                </button>
              </td>
              {!isExperienceRating ? <td>{displayNumber(row.played, 0)}</td> : null}
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
