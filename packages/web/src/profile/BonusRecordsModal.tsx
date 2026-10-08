import { formatRussianCount } from '../lib/russianPlural.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Star, Target, TrendingUp, X } from 'lucide-react';
import {
  fetchBonusRecords,
  type BonusRecordPlayer,
  type BonusSkillCode,
} from '../api/bonusGames.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { TournamentStandingsTable } from '../tournament/TournamentStandingsTable.js';

export function formatBonusDuration(ms: number): string {
  const tenths = Math.round(ms / 100);
  const seconds = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  if (tenths < 600) return `${seconds.format(tenths / 10)} сек`;
  return `${Math.floor(tenths / 600)} мин ${seconds.format((tenths % 600) / 10)} сек`;
}
export function formatBonusRecord(
  skill: string,
  result: { elapsedMs: number; shots: number; goals: number },
): string {
  const shots = formatRussianCount(result.shots, 'бросок', 'броска', 'бросков');
  if (skill === 'accuracy') {
    const accuracy = result.shots > 0 ? Math.round(result.goals / result.shots * 100) : 0;
    return `${result.goals} из ${result.shots} (${accuracy}%) · ${formatBonusDuration(result.elapsedMs)}`;
  }
  if (skill === 'endurance')
    return result.goals > 0 ? `${formatBonusDuration(result.elapsedMs / result.goals)}/гол` : '—';
  return `${formatBonusDuration(result.elapsedMs)}${skill === 'marksmanship' ? ` · ${shots}` : ''}`;
}

export function BonusRecordsModal({
  gameId,
  title,
  skillCode,
  currentUserId,
  onClose,
}: {
  gameId: string;
  title: string;
  skillCode: BonusSkillCode;
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
    queryKey: ['bonus-records', gameId, currentUserId],
    queryFn: ({ pageParam }) => fetchBonusRecords(gameId, pageParam),
    initialPageParam: 0,
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    refetchOnMount: 'always',
  });
  const rows = useMemo(() => {
    const unique = new Map<string, BonusRecordPlayer>();
    for (const page of query.data?.pages ?? [])
      for (const player of page.rows) unique.set(player.userId, player);
    return [...unique.values()];
  }, [query.data?.pages]);
  const firstPage = query.data?.pages[0];
  const currentUser = firstPage?.currentUser ?? null;
  const skill = firstPage?.skillCode ?? skillCode;
  const skillName = {
    speed: 'Скорость',
    accuracy: 'Точность',
    marksmanship: 'Меткость',
    endurance: 'Выносливость',
    challenge: 'Испытание',
  }[skill];
  const explanation = {
    speed: 'Время до прохождения. Чем быстрее, тем выше место.',
    accuracy: 'Выше тот, у кого выше процент попадания. При равном проценте выше тот, кто справился быстрее',
    marksmanship: 'Время до набора нужных очков. При равенстве сравниваем число бросков.',
    endurance: 'Среднее время на один гол. Чем меньше, тем выше место.',
    challenge: '',
  }[skill];

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

  const table = (players: BonusRecordPlayer[], hideHeader = false, observeCurrent = true) => (
    <div
      style={
        {
          '--bonus-record-result-chars': Math.max(
            12,
            ...[...rows, ...(currentUser ? [currentUser] : [])].flatMap((p) =>
              formatBonusRecord(skill, p)
                .split(' · ')
                .map((text, index) => text.length + (skill === 'accuracy' && index === 1 ? 3 : 0)),
            ),
          ),
        } as React.CSSProperties
      }
    >
      <TournamentStandingsTable
        variant="experience-rating"
        resultHeading={skill === 'endurance' ? 'На гол' : 'Результат'}
        resultValue={(row) => {
          const [primary,secondary] = formatBonusRecord(skill,row as unknown as BonusRecordPlayer).split(' · ');
          return <><span>{primary}</span>{secondary && <span className="bonus-records-result__secondary">{skill==='accuracy' ? `за ${secondary}` : secondary}</span>}</>;
        }}
        regularSource="head_to_head"
        dailyMetric={null}
        rows={players.map((p) => ({
          ...p,
          rank: p.place,
          user_id: p.userId,
          display_name: p.displayName,
          avatar_url: p.avatarUrl,
        }))}
        currentUserId={currentUserId}
        {...(observeCurrent
          ? { currentUserRowRef: currentRowRef, currentUserRowTestId: 'stat-rating-current-row' }
          : {})}
        hideHeader={hideHeader}
      />
    </div>
  );
  return (
    <AccessibleModal
      title={
        <span className="experience-rating__title">
          <Target aria-hidden="true" />
          <span>Рекорды</span>
        </span>
      }
      ariaLabel={`Рекорды: ${skillName} · ${title}`}
      onRequestClose={onClose}
      cardClassName="experience-rating-modal bonus-records-modal"
      headerAction={
        <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
          <X size={15} />
        </button>
      }
    >
      <p className="modal-copy bonus-records-modal__subtitle">
        {skillName} · {title}
      </p>
      <div className="bonus-records-modal__rewards">
        <p>Побей свой рекорд – получишь <span className="bonus-records-modal__reward" style={{ color: 'var(--reward-star)' }} aria-label="2 звезды"><Star size={14} fill="currentColor" aria-hidden="true" />2</span> и <span className="bonus-records-modal__reward" style={{ color: 'var(--reward-experience)' }} aria-label="10 опыта"><TrendingUp size={14} aria-hidden="true" />10</span>.</p>
        <p>Побей рекорд локации среди всех игроков – получишь <span className="bonus-records-modal__reward" style={{ color: 'var(--reward-star)' }} aria-label="10 звёзд"><Star size={14} fill="currentColor" aria-hidden="true" />10</span> и <span className="bonus-records-modal__reward" style={{ color: 'var(--reward-experience)' }} aria-label="30 опыта"><TrendingUp size={14} aria-hidden="true" />30</span>.</p>
        <p>Награда начисляется за каждое улучшение. Первый личный результат и повтор рекорда награды не дают. Первый результат в пустом рейтинге тоже без бонуса.</p>
      </div>
      <p className="modal-copy bonus-records-modal__explanation">{explanation}</p>
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
