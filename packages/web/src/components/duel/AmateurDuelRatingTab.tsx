import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAmateurRating } from '../../api/amateurDuel.js';
import type { UserPickerItem } from '../../chat/api.js';
import { GlassSelect } from '../GlassSelect.js';
import { TournamentStandingsTable } from '../../tournament/TournamentStandingsTable.js';

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
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
  const seasons = Array.from(new Set([seasonKey, ...(data?.available_seasons ?? [])]));
  const rows = (data?.rating ?? []).map((row, index) => ({
    ...row,
    rank: index + 1,
    played: row.matches_played,
  }));

  return (
    <section className="duel-section" aria-label="Рейтинг дуэлей">
      <div className="duel-section-title">Рейтинг</div>
      <GlassSelect
        ariaLabel="Месяц рейтинга дуэлей"
        value={seasonKey}
        options={seasons.map((key) => ({ value: key, label: monthLabel(key) }))}
        onChange={setSeasonKey}
      />
      {rating.isLoading ? (
        <div className="duel-state-card">Загрузка рейтинга…</div>
      ) : rating.isError ? (
        <div className="duel-state-card duel-state-card--error">Не удалось загрузить рейтинг.</div>
      ) : rows.length === 0 ? (
        <div className="duel-state-card">Рейтинг появится после первых завершённых дуэлей.</div>
      ) : (
        <div className="duel-rating-table-wrap">
          <TournamentStandingsTable
            rows={rows}
            regularSource="rating"
            dailyMetric="daily_place_points"
            resultHeading="Очки"
            currentUserId={currentUserId}
            onPlayerClick={(row) =>
              onOpenProfile({
                userId: String(row.user_id),
                displayName: String(row.display_name),
                avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
              })
            }
          />
        </div>
      )}
    </section>
  );
}
