import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchAmateurRating } from '../../api/amateurDuel.js';
import type { UserPickerItem } from '../../chat/api.js';
import { TournamentStandingsTable } from '../../tournament/TournamentStandingsTable.js';

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  const label = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
  return `${label.charAt(0).toUpperCase()}${label.slice(1).replace(/\s*г\.$/, '')}`;
}

export function AmateurDuelRatingTab({
  currentUserId,
  initialSeasonKey,
  onOpenProfile,
}: {
  currentUserId: string | null;
  initialSeasonKey: string;
  onOpenProfile: (profile: UserPickerItem) => void;
}): JSX.Element {
  const [seasonKey, setSeasonKey] = useState(initialSeasonKey);
  const rating = useQuery({
    queryKey: ['amateur-duel', 'rating', seasonKey],
    queryFn: () => fetchAmateurRating(seasonKey),
  });
  const data = rating.data;
  const seasons = Array.from(new Set([seasonKey, ...(data?.available_seasons ?? [])])).sort();
  const seasonIndex = seasons.indexOf(seasonKey);
  const previousSeason = seasonIndex > 0 ? seasons[seasonIndex - 1] : undefined;
  const nextSeason = seasonIndex >= 0 ? seasons[seasonIndex + 1] : undefined;
  const rows = (data?.rating ?? []).map((row, index) => ({
    ...row,
    rank: index + 1,
    played: row.matches_played,
  }));

  return (
    <section className="duel-section" aria-label="Рейтинг дуэлей">
      <div className="section-label duel-section-title">Рейтинг</div>
      <section
        className="glass tournament-details__content duel-rating-table-card"
        aria-label="Таблица рейтинга дуэлей"
      >
        <div className="daily-calendar__header duel-rating-month-nav">
          <button
            type="button"
            className="icon-btn daily-calendar__nav"
            aria-label="Предыдущий месяц рейтинга"
            disabled={previousSeason === undefined}
            onClick={() => previousSeason && setSeasonKey(previousSeason)}
          >
            <ChevronLeft size={16} />
          </button>
          <h2 className="daily-calendar__month">{monthLabel(seasonKey)}</h2>
          <button
            type="button"
            className="icon-btn daily-calendar__nav"
            aria-label="Следующий месяц рейтинга"
            disabled={nextSeason === undefined}
            onClick={() => nextSeason && setSeasonKey(nextSeason)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        {rating.isLoading ? (
          <div className="duel-state-card">Загрузка рейтинга…</div>
        ) : rating.isError ? (
          <div className="duel-state-card duel-state-card--error">Не удалось загрузить рейтинг.</div>
        ) : rows.length === 0 ? (
          <div className="duel-state-card">Рейтинг появится после первых завершённых дуэлей.</div>
        ) : (
          <TournamentStandingsTable
            rows={rows}
            regularSource="rating"
            dailyMetric="daily_place_points"
            resultHeading="Очки"
            variant="duel-rating"
            currentUserId={currentUserId}
            onPlayerClick={(row) =>
              onOpenProfile({
                userId: String(row.user_id),
                displayName: String(row.display_name),
                avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
              })
            }
          />
        )}
      </section>
    </section>
  );
}
