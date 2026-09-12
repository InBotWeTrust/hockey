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
  variant?:
    | 'default'
    | 'duel-rating'
    | 'experience-rating'
    | 'profile-goals-rating'
    | 'profile-accuracy-rating'
    | 'profile-streak-rating';
  currentUserRowRef?: (node: HTMLTableRowElement | null) => void;
  currentUserRowTestId?: string;
  hideHeader?: boolean;
}) {
  const playoffSize = Math.max(0, Math.floor(Number(props.playoffSize) || 0));
  const isDuelRating = props.variant === 'duel-rating';
  const isExperienceRating = props.variant === 'experience-rating';
  const isProfileStatRating = props.variant?.startsWith('profile-') === true;
  const result = resultColumn(
    props.regularSource,
    props.dailyMetric,
    isDuelRating,
    isExperienceRating,
  );
  const variantClass = isDuelRating
    ? ' tournament-standing-table--duel-rating'
    : isExperienceRating || isProfileStatRating
      ? ` tournament-standing-table--experience-rating${isProfileStatRating ? ` tournament-standing-table--${props.variant}` : ''}`
      : '';
  return (
    <table className={`tournament-standing-table${variantClass}`}>
      {!props.hideHeader ? (
        <thead>
          <tr>
            <th scope="col">
              {isDuelRating || isExperienceRating || isProfileStatRating ? 'М' : 'Место'}
            </th>
            <th scope="col">Игрок</th>
            {props.variant === 'profile-goals-rating' ? (
              <>
                <th scope="col">Броски</th>
                <th scope="col">Шайбы</th>
              </>
            ) : null}
            {props.variant === 'profile-accuracy-rating' ? (
              <>
                <th scope="col">Броски</th>
                <th scope="col">Попадания</th>
                <th scope="col">Точность</th>
              </>
            ) : null}
            {props.variant === 'profile-streak-rating' ? (
              <>
                <th scope="col">Текущая серия</th>
                <th scope="col">Рекорд</th>
              </>
            ) : null}
            {!isExperienceRating && !isProfileStatRating ? (
              <th scope="col">{isDuelRating ? 'И' : 'Игры'}</th>
            ) : null}
            {isDuelRating ? (
              <>
                <th scope="col">В</th>
                <th scope="col">Н</th>
                <th scope="col">П</th>
              </>
            ) : null}
            {!isProfileStatRating ? (
              <th scope="col">{isDuelRating ? 'О' : (props.resultHeading ?? result.heading)}</th>
            ) : null}
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
          const allowsMedals = isDuelRating || (!isExperienceRating && !isProfileStatRating);
          const medalClass =
            !isCurrentUser && allowsMedals
              ? rank === 2
                ? 'tournament-standing-table__medal-place--silver'
                : isDuelRating
                  ? rank === 1
                    ? 'tournament-standing-table__medal-place--gold'
                    : rank === 3
                      ? 'tournament-standing-table__medal-place--bronze'
                      : ''
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
                    size={isDuelRating || isExperienceRating || isProfileStatRating ? 24 : 28}
                    fontSize={isDuelRating || isExperienceRating || isProfileStatRating ? 10 : 11}
                    alt={playerName}
                    style={{ background: 'rgba(30, 91, 151, 0.13)', color: '#244d73' }}
                  />
                  <span title={playerName}>{playerName}</span>
                </button>
              </td>
              {props.variant === 'profile-goals-rating' ? (
                <>
                  <td>{displayNumber(row.shots, 0)}</td>
                  <td>{displayNumber(row.goals, 0)}</td>
                </>
              ) : null}
              {props.variant === 'profile-accuracy-rating' ? (
                <>
                  <td>{displayNumber(row.shots, 0)}</td>
                  <td>{displayNumber(row.goals, 0)}</td>
                  <td>{displayNumber(row.accuracy, 1)}%</td>
                </>
              ) : null}
              {props.variant === 'profile-streak-rating' ? (
                <>
                  <td>{displayNumber(row.current_streak_days, 0)}</td>
                  <td>{displayNumber(row.record_streak_days, 0)}</td>
                </>
              ) : null}
              {!isExperienceRating && !isProfileStatRating ? (
                <td>{displayNumber(row.played, 0)}</td>
              ) : null}
              {isDuelRating ? (
                <>
                  <td>{displayNumber(row.wins, 0)}</td>
                  <td>{displayNumber(row.draws, 0)}</td>
                  <td>{displayNumber(row.losses, 0)}</td>
                </>
              ) : null}
              {!isProfileStatRating ? <td>{result.value(row)}</td> : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
