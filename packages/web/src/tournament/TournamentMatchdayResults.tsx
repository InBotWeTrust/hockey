import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  fetchTournamentMatchdayResults,
  type TournamentMatchdayResultCursor,
} from '../api/tournament.js';
import { UserAvatar } from '../chat/components/UserAvatar.js';

const PAGE_SIZE = 4;

function puckWord(value: number): string {
  const lastTwo = Math.abs(value) % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return 'шайб';
  const last = lastTwo % 10;
  if (last === 1) return 'шайба';
  if (last >= 2 && last <= 4) return 'шайбы';
  return 'шайб';
}

export function TournamentMatchdayResults({
  tournamentId,
  matchdayNumber,
  viewerUserId,
}: {
  tournamentId: string;
  matchdayNumber: number;
  viewerUserId: string;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const query = useInfiniteQuery({
    queryKey: [
      'tournaments',
      tournamentId,
      'matchdays',
      matchdayNumber,
      'results',
      viewerUserId,
    ],
    queryFn: ({ pageParam }) =>
      fetchTournamentMatchdayResults(tournamentId, matchdayNumber, pageParam, PAGE_SIZE),
    initialPageParam: null as TournamentMatchdayResultCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const loadedResults = query.data?.pages.flatMap((page) => page.results) ?? [];
  const visibleResults = expanded ? loadedResults : loadedResults.slice(0, PAGE_SIZE);
  const canExpandCached = !expanded && loadedResults.length > PAGE_SIZE;
  const showMore = query.hasNextPage || canExpandCached;

  return (
    <section className="tournament-matchday-past" aria-label="Прошедшие игры дня">
      <h5>Прошедшие игры дня</h5>
      {query.isLoading && <p>Загружаем результаты…</p>}
      {query.isError && <p role="alert">Не удалось загрузить результаты.</p>}
      {!query.isLoading && !query.isError && loadedResults.length === 0 && (
        <p>Других завершённых игр пока нет.</p>
      )}
      {visibleResults.map((result) => (
        <article key={result.id} className="tournament-matchday-past__row">
          <UserAvatar
            avatarUrl={result.avatarUrl}
            name={result.displayName}
            size={30}
            alt={result.displayName ?? 'Участник'}
          />
          <div>
            <strong>{result.displayName ?? 'Участник'}</strong>
            <span>
              {result.goals} {puckWord(result.goals)} из {result.shots} · точность{' '}
              {Math.round(result.accuracy * 100)}%
            </span>
          </div>
        </article>
      ))}
      {(showMore || (expanded && loadedResults.length > PAGE_SIZE)) && (
        <div className="tournament-matchday-past__actions">
          {showMore && (
            <button
              type="button"
              className="tournament-calendar__expand"
              disabled={query.isFetchingNextPage}
              onClick={() => {
                if (canExpandCached) {
                  setExpanded(true);
                  return;
                }
                void query.fetchNextPage().then(() => setExpanded(true));
              }}
            >
              {query.isFetchingNextPage ? 'Загружаем…' : 'Показать ещё'}
            </button>
          )}
          {expanded && loadedResults.length > PAGE_SIZE && (
            <button
              type="button"
              className="tournament-calendar__expand"
              onClick={() => setExpanded(false)}
            >
              Свернуть
            </button>
          )}
        </div>
      )}
    </section>
  );
}
