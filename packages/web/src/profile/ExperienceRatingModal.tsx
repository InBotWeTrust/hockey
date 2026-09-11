import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { fetchExperienceRatingPage, type ExperienceRatingPlayer } from '../api/experienceRating.js';
import { UserAvatar } from '../chat/components/UserAvatar.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { formatProfileNumber } from '../screens/profileSections.js';

function RatingRow({
  player,
  current,
  rowRef,
  testId,
}: {
  player: ExperienceRatingPlayer;
  current: boolean;
  rowRef?: (node: HTMLTableRowElement | null) => void;
  testId?: string;
}): JSX.Element {
  return (
    <tr
      ref={rowRef}
      className={current ? 'experience-rating__current-user' : undefined}
      data-testid={testId}
      aria-label={`${player.place} место, ${player.displayName}, ${player.experience} опыта`}
    >
      <td>{player.place}</td>
      <td>
        <span className="experience-rating__player">
          <UserAvatar
            avatarUrl={player.avatarUrl}
            name={player.displayName}
            size={30}
            fontSize={11}
            alt={player.displayName}
            style={{ background: 'linear-gradient(135deg, #2aa8f2, #2774df)' }}
          />
          <span title={player.displayName}>{player.displayName}</span>
        </span>
      </td>
      <td>{formatProfileNumber(player.experience)}</td>
    </tr>
  );
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
    <table className="experience-rating__table">
      <thead>
        <tr>
          <th scope="col">Место</th>
          <th scope="col">Игрок</th>
          <th scope="col">Опыт</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((player) => {
          const current = player.userId === currentUserId;
          return (
            <RatingRow
              key={player.userId}
              player={player}
              current={current}
              {...(current
                ? { rowRef: currentRowRef, testId: 'experience-rating-current-row' }
                : {})}
            />
          );
        })}
      </tbody>
    </table>
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
    if (root === null || target === null || !query.hasNextPage) return undefined;
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
    if (root === null || currentRowElement === null) {
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
      title="Рейтинг по опыту"
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
          <table className="experience-rating__table">
            <tbody>
              <RatingRow player={currentUser} current />
            </tbody>
          </table>
        </div>
      ) : null}
    </AccessibleModal>
  );
}
