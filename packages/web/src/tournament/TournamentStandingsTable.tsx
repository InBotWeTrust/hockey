function displayNumber(rawValue: unknown, maximumFractionDigits = 2): string {
  const parsed = Number(rawValue);
  const value = Number.isFinite(parsed) ? parsed : 0;
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits }).format(value);
}

function resultColumn(regularSource: string, dailyMetric: string | null) {
  if (regularSource === 'daily_aggregate' && dailyMetric === 'accuracy_average') {
    return {
      heading: 'Точность',
      value: (row: Record<string, unknown>) => `${displayNumber(Number(row.points) * 100, 1)}%`,
    };
  }
  if (regularSource === 'daily_aggregate' && dailyMetric === 'daily_place_points') {
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
}) {
  const result = resultColumn(props.regularSource, props.dailyMetric);
  return (
    <table className="tournament-standing-table">
      <thead>
        <tr>
          <th scope="col">Место</th>
          <th scope="col">Игрок</th>
          <th scope="col">Игры</th>
          <th scope="col">{result.heading}</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row, index) => {
          const playerName = String(row.display_name ?? `Участник ${index + 1}`);
          return (
            <tr key={String(row.user_id ?? index)}>
              <td>{displayNumber(row.rank ?? index + 1, 0)}</td>
              <td>
                <div className="tournament-standing-player">
                  <UserAvatar
                    avatarUrl={typeof row.avatar_url === 'string' ? row.avatar_url : null}
                    name={playerName}
                    size={28}
                    fontSize={11}
                    alt={playerName}
                    style={{ background: 'rgba(30, 91, 151, 0.13)', color: '#244d73' }}
                  />
                  <span title={playerName}>{playerName}</span>
                </div>
              </td>
              <td>{displayNumber(row.played, 0)}</td>
              <td>{result.value(row)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
import { UserAvatar } from '../chat/components/UserAvatar.js';
