import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Crosshair, Flame, Target, X } from 'lucide-react';
import {
  fetchStatRatingPage,
  type StatRatingMetric,
  type StatRatingPlayer,
} from '../api/statRating.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { TournamentStandingsTable } from '../tournament/TournamentStandingsTable.js';

const config = {
  goals: { title: 'Рейтинг по шайбам', icon: Target, variant: 'profile-goals-rating' },
  accuracy: { title: 'Рейтинг по точности', icon: Crosshair, variant: 'profile-accuracy-rating' },
  streak: { title: 'Рейтинг игровых дней', icon: Flame, variant: 'profile-streak-rating' },
} as const;

function tableRows(players: StatRatingPlayer[]): Array<Record<string, unknown>> {
  return players.map((p) => ({
    rank: p.place,
    user_id: p.userId,
    display_name: p.displayName,
    avatar_url: p.avatarUrl,
    goals: p.goals,
    shots: p.shots,
    accuracy: p.accuracy,
    current_streak_days: p.currentStreakDays,
    record_streak_days: p.recordStreakDays,
  }));
}

export function StatRatingModal({
  metric,
  currentUserId,
  onClose,
}: {
  metric: StatRatingMetric;
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
    queryKey: ['profile', 'stat-rating', metric],
    queryFn: ({ pageParam }) => fetchStatRatingPage(metric, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = useMemo(() => {
    const unique = new Map<string, StatRatingPlayer>();
    for (const page of query.data?.pages ?? [])
      for (const player of page.rows) unique.set(player.userId, player);
    return [...unique.values()];
  }, [query.data?.pages]);
  const firstPage = query.data?.pages[0];
  const currentUser = firstPage?.currentUser ?? null;
  const modal = config[metric];
  const Icon = modal.icon;

  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (
      root === null ||
      target === null ||
      !query.hasNextPage ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !query.isFetchingNextPage)
          void query.fetchNextPage();
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
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setCurrentRowVisible(entry?.isIntersecting === true),
      { root, threshold: 0.65 },
    );
    observer.observe(currentRowElement);
    return () => observer.disconnect();
  }, [currentRowElement]);

  const table = (players: StatRatingPlayer[], hideHeader = false, observeCurrent = true) => (
    <TournamentStandingsTable
      variant={modal.variant}
      regularSource="head_to_head"
      dailyMetric={null}
      rows={tableRows(players)}
      currentUserId={currentUserId}
      {...(observeCurrent
        ? { currentUserRowRef: currentRowRef, currentUserRowTestId: 'stat-rating-current-row' }
        : {})}
      hideHeader={hideHeader}
    />
  );
  return (
    <AccessibleModal
      title={
        <span className="experience-rating__title">
          <Icon aria-hidden="true" />
          <span>{modal.title}</span>
        </span>
      }
      ariaLabel={modal.title}
      onRequestClose={onClose}
      cardClassName="experience-rating-modal"
      headerAction={
        <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
          <X size={15} />
        </button>
      }
    >
      {metric === 'accuracy' && firstPage?.eligibility.eligible === false ? (
        <div className="stat-rating__eligibility" role="note">
          <strong>Вы попадёте в рейтинг точности после 1000 забитых шайб.</strong>
          <span>
            У вас {firstPage.eligibility.goals ?? 0} из{' '}
            {firstPage.eligibility.requiredGoals ?? 1000}
          </span>
        </div>
      ) : null}
      <div className="experience-rating__viewport" ref={scrollRef}>
        {query.isLoading ? (
          <p className="experience-rating__state" role="status">
            Загружаем рейтинг…
          </p>
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
          table(rows)
        )}
        <div ref={sentinelRef} data-testid="stat-rating-sentinel" aria-hidden="true" />
        {query.isFetchingNextPage ? (
          <p className="experience-rating__more">Загружаем ещё…</p>
        ) : null}
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
      {currentUser !== null && !currentRowVisible ? (
        <div className="experience-rating__pinned" data-testid="stat-rating-pinned-current">
          {table([currentUser], true, false)}
        </div>
      ) : null}
    </AccessibleModal>
  );
}
