import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  heading,
  onPlayerClick,
}: {
  heading?:string;
  onPlayerClick?:(row:Record<string,unknown>)=>void;
  rows: ExperienceRatingPlayer[];
  currentUserId: string;
  currentRowRef: (node: HTMLTableRowElement | null) => void;
}): JSX.Element {
  return (
    <TournamentStandingsTable
      {...(heading?{resultHeading:heading}:{})}
      {...(onPlayerClick?{onPlayerClick}:{})}
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
  onCurrentUser,
  onClose,
  source,
}: {
  source?:{key:readonly unknown[];title:string;heading:string;icon?:ReactNode;load:(cursor:string|null)=>Promise<{rows:ExperienceRatingPlayer[];nextCursor:string|null;currentUser?:ExperienceRatingPlayer}>;headerAction?:ReactNode;content?:ReactNode;onPlayerClick?:(row:Record<string,unknown>)=>void};
  currentUserId: string;
  onCurrentUser: (player: ExperienceRatingPlayer) => void;
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
    queryKey: source?.key??['profile', 'experience-rating'],
    queryFn: ({ pageParam }) => source?source.load(pageParam):fetchExperienceRatingPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchOnMount: 'always',
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
    if (currentUser !== undefined) onCurrentUser(currentUser);
  }, [currentUser, onCurrentUser]);

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
          {source?.icon??<TrendingUp data-testid="experience-rating-title-icon" aria-hidden="true" />}
          <span>{source?.title??'Рейтинг по опыту'}</span>
        </span>
      }
      ariaLabel={source?.title??'Рейтинг по опыту'}
      onRequestClose={onClose}
      cardClassName="experience-rating-modal"
      headerAction={
        <div style={{display:'flex',alignItems:'center',gap:8}}>{source?.headerAction}<button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
          <X size={15} />
        </button></div>
      }
    >
      <div className="experience-rating__viewport" ref={scrollRef}>
        {source?.content??(query.isLoading ? (
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
          <RatingTable rows={rows} currentUserId={currentUserId} currentRowRef={currentRowRef} {...(source?{heading:source.heading}: {})} {...(source?.onPlayerClick?{onPlayerClick:source.onPlayerClick}:{})}/>
        ))}
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
      {!source?.content && currentUser !== undefined && !currentRowVisible ? (
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
