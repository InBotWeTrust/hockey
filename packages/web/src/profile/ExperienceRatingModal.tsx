import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { TrendingUp, X } from 'lucide-react';
import { fetchExperienceRatingPage, type ExperienceRatingPlayer } from '../api/experienceRating.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { TournamentStandingsTable } from '../tournament/TournamentStandingsTable.js';

function ratingRows(players: ExperienceRatingPlayer[]): Array<Record<string, unknown>> {
  return players.map((player) => ({
    rank: player.place,
    user_id: player.userId,
    display_name: player.displayName,
    avatar_url: player.avatarUrl,
    experience: player.experience,
  }));
}

function RatingTable({
  rows,
  currentUserId,
  currentRowRef,
}: {
  rows: ExperienceRatingPlayer[];
  currentUserId: string;
  currentRowRef: (node: HTMLTableRowElement | null) => void;
}): JSX.Element {
  return (
    <TournamentStandingsTable
      variant="experience-rating"
      regularSource="head_to_head"
      dailyMetric={null}
      rows={ratingRows(rows)}
      currentUserId={currentUserId}
      currentUserRowRef={currentRowRef}
      currentUserRowTestId="experience-rating-current-row"
    />
  );
}

export function ExperienceRatingModal({
  currentUserId,
  onClose,
}: {
  currentUserId: string;
  onClose: () => void;
}): JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [currentRowElement, setCurrentRowElement] = useState<HTMLTableRowElement | null>(null);
  const [currentRowVisible, setCurrentRowVisible] = useState(false);
  const currentRowRef = useCallback((node: HTMLTableRowElement | null) => {
    setCurrentRowElement(node);
    if (node === null) setCurrentRowVisible(false);
  }, []);

  const query = useInfiniteQuery({
    queryKey: ['profile', 'experience-rating'],
    queryFn: ({ pageParam }) => fetchExperienceRatingPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const rows = useMemo(() => {
    const unique = new Map<string, ExperienceRatingPlayer>();
    for (const page of query.data?.pages ?? []) {
      for (const player of page.rows) unique.set(player.userId, player);
    }
    return [...unique.values()];
  }, [query.data?.pages]);
  const currentUser = query.data?.pages[0]?.currentUser;

  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (
      root === null ||
      target === null ||
      !query.hasNextPage ||
      typeof IntersectionObserver === 'undefined'
    ) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !query.isFetchingNextPage) {
          void query.fetchNextPage();
        }
      },
      { root, rootMargin: '120px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage]);

  useEffect(() => {
    const root = scrollRef.current;
    if (
      root === null ||
      currentRowElement === null ||
      typeof IntersectionObserver === 'undefined'
    ) {
      setCurrentRowVisible(false);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setCurrentRowVisible(entry?.isIntersecting === true),
      { root, threshold: 0.65 },
    );
    observer.observe(currentRowElement);
    return () => observer.disconnect();
  }, [currentRowElement]);

  return (
    <AccessibleModal
      title={
        <span className="experience-rating__title">
          <TrendingUp data-testid="experience-rating-title-icon" aria-hidden="true" />
          <span>Рейтинг по опыту</span>
        </span>
      }
      ariaLabel="Рейтинг по опыту"
      onRequestClose={onClose}
      cardClassName="experience-rating-modal"
      headerAction={
        <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
          <X size={15} />
        </button>
      }
    >
      <div className="experience-rating__viewport" ref={scrollRef}>
        {query.isLoading ? (
          <p className="experience-rating__state" role="status">Загружаем рейтинг…</p>
        ) : query.isError && rows.length === 0 ? (
          <div className="experience-rating__state" role="alert">
            <span>Не удалось загрузить рейтинг</span>
            <button type="button" className="btn btn--ghost" onClick={() => void query.refetch()}>
              Повторить
            </button>
          </div>
        ) : rows.length === 0 ? (
          <p className="experience-rating__state">Рейтинг пока пуст</p>
        ) : (
          <RatingTable rows={rows} currentUserId={currentUserId} currentRowRef={currentRowRef} />
        )}
        <div ref={sentinelRef} data-testid="experience-rating-sentinel" aria-hidden="true" />
        {query.isFetchingNextPage ? <p className="experience-rating__more">Загружаем ещё…</p> : null}
        {query.isFetchNextPageError ? (
          <button
            type="button"
            className="btn btn--ghost experience-rating__retry"
            aria-label="Повторить загрузку"
            onClick={() => void query.fetchNextPage()}
          >
            Повторить
          </button>
        ) : null}
      </div>
      {currentUser !== undefined && !currentRowVisible ? (
        <div className="experience-rating__pinned" data-testid="experience-rating-pinned-current">
          <TournamentStandingsTable
            variant="experience-rating"
            regularSource="head_to_head"
            dailyMetric={null}
            rows={ratingRows([currentUser])}
            currentUserId={currentUserId}
            hideHeader
          />
        </div>
      ) : null}
    </AccessibleModal>
  );
}
