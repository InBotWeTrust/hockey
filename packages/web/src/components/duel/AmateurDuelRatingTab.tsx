import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Info, X } from 'lucide-react';
import { fetchAmateurRating } from '../../api/amateurDuel.js';
import type { UserPickerItem } from '../../chat/api.js';
import { TournamentStandingsTable } from '../../tournament/TournamentStandingsTable.js';
import { SegmentedTabs } from '../SegmentedTabs.js';
import type { AmateurDuelKind } from '../../api/amateurDuel.js';
import { AccessibleModal } from '../AccessibleModal.js';

type RatingScope = 'overall' | AmateurDuelKind;
const RATING_SCOPES: Array<{ id: RatingScope; label: string }> = [
  { id: 'overall', label: 'Общий' },
  { id: 'express', label: 'Экспресс' },
  { id: 'express_plus', label: 'Микс' },
  { id: 'classic', label: 'Классика' },
];

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
  const [scope, setScope] = useState<RatingScope>('overall');
  const [rulesOpen, setRulesOpen] = useState(false);
  const rating = useQuery({
    queryKey: ['amateur-duel', 'rating', seasonKey, scope],
    queryFn: () => fetchAmateurRating(seasonKey, scope),
  });
  const data = rating.data;
  const seasons = Array.from(new Set([seasonKey, ...(data?.available_seasons ?? [])])).sort();
  const seasonIndex = seasons.indexOf(seasonKey);
  const previousSeason = seasonIndex > 0 ? seasons[seasonIndex - 1] : undefined;
  const nextSeason = seasonIndex >= 0 ? seasons[seasonIndex + 1] : undefined;
  const rows = (data?.rating ?? []).filter((row) => row.eligible !== false).map((row, index) => ({
    ...row,
    rank: row.place ?? index + 1,
    played: row.matches_played,
  }));
  const unqualified = (data?.rating ?? []).filter((row) => row.eligible === false);

  return (
    <section className="duel-section" aria-label="Рейтинг дуэлей">
      <div className="section-label duel-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        Рейтинг
        <button type="button" className="icon-btn" aria-label="Правила рейтинга дуэлей" onClick={() => setRulesOpen(true)}>
          <Info size={16} />
        </button>
      </div>
      <SegmentedTabs
        items={RATING_SCOPES}
        activeTab={scope}
        ariaLabel="Зачёт рейтинга дуэлей"
        onChange={setScope}
      />
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
          <div className="duel-state-card duel-state-card--error">
            Не удалось загрузить рейтинг.
          </div>
        ) : rows.length === 0 && unqualified.length === 0 ? (
          <p className="duel-rating-empty">Рейтинг появится после первых завершённых дуэлей.</p>
        ) : rows.length > 0 ? (
          <TournamentStandingsTable
            rows={rows}
            regularSource="head_to_head"
            dailyMetric={null}
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
        ) : null}
        {unqualified.length > 0 && (
          <section aria-label="Пока вне зачёта" style={{ display: 'grid', gap: 6, marginTop: 14 }}>
            <h3 style={{ margin: 0 }}>Пока вне зачёта</h3>
            {unqualified.map((row) => (
              <div key={row.user_id}>
                {row.display_name} — ещё {row.matches_to_qualify ?? 0} матчей до зачёта
              </div>
            ))}
          </section>
        )}
      </section>
      {rulesOpen && (
        <AccessibleModal
          title={`Рейтинг: ${RATING_SCOPES.find((item) => item.id === scope)?.label ?? scope}`}
          onRequestClose={() => setRulesOpen(false)}
          headerAction={<button type="button" className="icon-btn" aria-label="Закрыть правила" onClick={() => setRulesOpen(false)}><X size={16} /></button>}
        >
          <p>В зачёт входят только обычные завершённые дуэли. Турнирные игры не учитываются.</p>
          <p>Для попадания в таблицу нужно сыграть не менее {data?.reward_rules?.minimumMatches ?? data?.prize_threshold ?? (scope === 'overall' ? 30 : 10)} дуэлей {scope === 'overall' ? 'за месяц' : 'в этом формате за месяц'}.</p>
          <p>Места определяются по очкам, затем по очным встречам, числу матчей и победам.</p>
          {data?.reward_rules?.enabled === false ? (
            <p>Награды за этот зачёт сейчас выключены.</p>
          ) : data?.reward_rules && Object.values(data.reward_rules).every((value) =>
            typeof value !== 'object' || value === null ||
            Object.values(value).every((amount) => amount === 0)) ? (
            <p>Награды за этот зачёт не назначены.</p>
          ) : data?.reward_rules ? (
            <div>
              {Object.entries({
                '1-е место': data.reward_rules.first,
                ...(scope === 'overall' ? {
                  '2-е место': data.reward_rules.second,
                  '3-е место': data.reward_rules.third,
                  '4–10-е места': data.reward_rules.fourToTen,
                  '11–50-е места': data.reward_rules.elevenToFifty,
                } : {}),
              }).map(([place, reward]) => reward && (
                <p key={place}>{place}: {reward.coins} монет, {reward.stars} звёзд, {reward.experience} опыта, {reward.tokens} токенов</p>
              ))}
            </div>
          ) : <p>Загрузка наград…</p>}
        </AccessibleModal>
      )}
    </section>
  );
}
