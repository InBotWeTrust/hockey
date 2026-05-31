import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { fetchAchievements } from '../api/achievements.js';
import { fetchWeeklyChallenge } from '../api/weeklyChallenge.js';
import { useDailyStore } from '../stores/dailyStore.js';
import { useTrainingSessionStore } from '../stores/trainingSessionStore.js';

const DEFAULT_AMATEUR_UNLOCK_GOALS_REQUIRED = 300;
const SECTION_ARTWORK_SIZE = 86;

const SECTION_ARTWORK = {
  weekly: '/modes/weekly-challenge.webp',
  achievements: '/achievements/first-goal.webp',
  daily: '/daily-game/start.webp',
  training: '/modes/beginner.webp',
  amateur: '/modes/amateur.webp',
  pro: '/modes/pro.webp',
  shop: '/modes/shop.webp',
} as const;

type SectionTone = 'active' | 'default' | 'muted';

function numberText(value: number): string {
  return new Intl.NumberFormat('ru-RU', { useGrouping: false }).format(value);
}

export function SectionsScreen(): JSX.Element {
  const navigate = useNavigate();
  const dailyData = useDailyStore((s) => s.data);
  const refreshDaily = useDailyStore((s) => s.refresh);
  const trainingData = useTrainingSessionStore((s) => s.data);
  const refreshTraining = useTrainingSessionStore((s) => s.refresh);
  const [lockedInfo, setLockedInfo] = useState<{ title: string; text: string } | null>(null);
  const weeklyChallenge = useQuery({
    queryKey: ['weekly-challenge', 'section'],
    queryFn: fetchWeeklyChallenge,
  });
  const achievementsQuery = useQuery({
    queryKey: ['achievements', 'section'],
    queryFn: fetchAchievements,
  });

  useEffect(() => {
    void refreshDaily();
    void refreshTraining();
  }, [refreshDaily, refreshTraining]);

  const amateurUnlockGoalsRequired = Math.max(
    0,
    dailyData?.amateur_unlock_goals_required ?? DEFAULT_AMATEUR_UNLOCK_GOALS_REQUIRED,
  );
  const amateurGoals = Math.min(amateurUnlockGoalsRequired, dailyData?.lifetime_total_goals ?? 0);
  const isAmateurUnlocked = (dailyData?.lifetime_total_goals ?? 0) >= amateurUnlockGoalsRequired;
  const trainingShotsLimit = trainingData?.shots_limit ?? 500;
  const trainingShotsTaken = trainingData?.shots_taken ?? 0;
  const dailyShotsLimit = (dailyData?.shots_per_period ?? 30) * (dailyData?.total_periods ?? 3);
  const weeklyCanClaimReward =
    weeklyChallenge.data?.challenge?.canClaimReward === true ||
    (weeklyChallenge.data?.pendingRewards?.length ?? 0) > 0;
  const weeklyNeedsDecision =
    weeklyChallenge.data?.challenge?.canJoin === true || weeklyCanClaimReward;
  const weeklyMeta = weeklyCanClaimReward
    ? 'Получить награду'
    : weeklyChallenge.data?.challenge
      ? weeklyChallenge.data.challenge.canJoin
        ? 'Нужно подтвердить участие'
        : weeklyChallenge.data.challenge.status === 'running'
          ? 'Челлендж идет'
          : weeklyChallenge.data.challenge.status === 'join_open'
            ? 'Открыт набор участников'
            : weeklyChallenge.data.challenge.status === 'finished'
              ? 'Челлендж завершен'
              : 'Вход скоро откроется'
      : 'Нет активного челленджа';

  const openAmateurs = (): void => {
    if (!isAmateurUnlocked) {
      setLockedInfo({
        title: 'Не хватает шайб',
        text: `Для открытия любительского раздела нужно забить ${numberText(amateurUnlockGoalsRequired)} шайб в ежедневной игре.`,
      });
      return;
    }
    navigate('/?view=amateur&from=sections');
  };

  return (
    <main
      className="screen"
      style={{
        padding: 'calc(18px + var(--app-safe-top)) 14px 24px',
        overflowY: 'auto',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 760,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div className="section-label section-label--page">Разделы</div>

        <SectionCard
          title="Задания"
          description="Полный список целей и наград"
          meta={
            (achievementsQuery.data?.unclaimedCount ?? 0) > 0
              ? `${achievementsQuery.data?.unclaimedCount ?? 0} наград ждёт`
              : 'Награды, серии и будущие цели'
          }
          tone={(achievementsQuery.data?.unclaimedCount ?? 0) > 0 ? 'active' : 'default'}
          artworkSrc={SECTION_ARTWORK.achievements}
          onClick={() => navigate('/achievements')}
        />
        <SectionCard
          title="Ежедневная игра"
          description="Сегодняшняя игра и статистика прошедших дней"
          meta={`${numberText(dailyData?.daily_total_shots ?? 0)}/${numberText(dailyShotsLimit)} бросков сегодня`}
          tone="active"
          artworkSrc={SECTION_ARTWORK.daily}
          onClick={() => navigate('/daily')}
        />
        <SectionCard
          title="Тренировка"
          description="Периоды на выбор, броски без риска для дневной игры"
          meta={`${trainingShotsTaken}/${trainingShotsLimit} бросков сегодня`}
          tone="active"
          artworkSrc={SECTION_ARTWORK.training}
          onClick={() => navigate('/?view=training&from=sections')}
        />
        <SectionCard
          title="Любители"
          description="Дуэли, турниры и соревновательные форматы"
          meta={
            isAmateurUnlocked
              ? 'Раздел открыт'
              : `${numberText(amateurGoals)}/${numberText(amateurUnlockGoalsRequired)} шайб для открытия`
          }
          tone={isAmateurUnlocked ? 'default' : 'muted'}
          artworkSrc={SECTION_ARTWORK.amateur}
          progress={
            isAmateurUnlocked
              ? undefined
              : amateurUnlockGoalsRequired > 0
                ? Math.round((amateurGoals / amateurUnlockGoalsRequired) * 100)
                : 100
          }
          onClick={openAmateurs}
        />
        <SectionCard
          title="Профессионалы"
          description="Игры самого высокого уровня"
          meta="Раздел в разработке"
          tone="muted"
          artworkSrc={SECTION_ARTWORK.pro}
          onClick={() => navigate('/?view=pro&from=sections')}
        />
        <SectionCard
          title="Челлендж недели"
          description="Недельные вызовы и награды"
          meta={weeklyChallenge.isLoading ? 'Проверяем активность' : weeklyMeta}
          tone={weeklyChallenge.data?.challenge ? 'active' : 'default'}
          artworkSrc={SECTION_ARTWORK.weekly}
          attention={weeklyNeedsDecision}
          onClick={() => navigate('/weekly-challenge')}
        />
        <SectionCard
          title="Магазин"
          description="Валюта, инвентарь и предметы"
          meta="Монеты, звёзды и экипировка"
          tone="default"
          artworkSrc={SECTION_ARTWORK.shop}
          onClick={() => navigate('/inventory')}
        />
      </section>

      {lockedInfo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lockedInfo.title}
          onClick={() => setLockedInfo(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 250,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            background: 'rgba(15, 23, 42, 0.35)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <div
            className="glass"
            onClick={(event) => event.stopPropagation()}
            style={{ borderRadius: 24, padding: '22px 22px 18px', maxWidth: 320, width: '100%' }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginBottom: 10 }}>
              {lockedInfo.title}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
              {lockedInfo.text}
            </div>
            <button
              type="button"
              className="btn btn--cta"
              onClick={() => setLockedInfo(null)}
              style={{ marginTop: 18, width: '100%', padding: '12px 0', fontSize: 14 }}
            >
              Понятно
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function SectionCard({
  title,
  description,
  meta,
  tone,
  artworkSrc,
  progress,
  attention,
  onClick,
}: {
  title: string;
  description: string;
  meta: string;
  tone: SectionTone;
  artworkSrc: string;
  progress?: number | undefined;
  attention?: boolean | undefined;
  onClick: () => void;
}): JSX.Element {
  const muted = tone === 'muted';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 22,
        padding: 14,
        display: 'grid',
        gridTemplateColumns: `${SECTION_ARTWORK_SIZE}px minmax(0, 1fr) 20px`,
        gap: 12,
        alignItems: 'center',
        width: '100%',
        minHeight: 116,
        color: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
        appearance: 'none',
        WebkitAppearance: 'none',
        background:
          tone === 'active'
            ? 'rgba(255, 255, 255, 0.66)'
            : muted
              ? 'rgba(255, 255, 255, 0.34)'
              : 'rgba(255, 255, 255, 0.5)',
        border: '1px solid rgba(255,255,255,0.68)',
        boxShadow: '0 8px 22px rgba(15,23,42,0.1), inset 0 1px 0 rgba(255,255,255,0.78)',
      }}
    >
      {progress !== undefined && (
        <div
          aria-label={`Прогресс ${progress}%`}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 3,
            background: 'rgba(15,23,42,0.08)',
          }}
        >
          <div
            style={{
              width: `${Math.max(0, Math.min(100, progress))}%`,
              height: '100%',
              background: 'linear-gradient(90deg, rgba(34,158,217,0.72), var(--blue-accent))',
            }}
          />
        </div>
      )}
      <span
        aria-label={`Изображение раздела ${title}`}
        style={{
          width: SECTION_ARTWORK_SIZE,
          height: SECTION_ARTWORK_SIZE,
          aspectRatio: '1 / 1',
          borderRadius: 22,
          display: 'block',
          overflow: 'hidden',
          background: muted ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.58)',
          border: '1px solid rgba(255,255,255,0.78)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 8px 18px rgba(15,23,42,0.12)',
        }}
      >
        <img
          src={artworkSrc}
          alt=""
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            objectFit: 'cover',
            filter: muted ? 'grayscale(1) saturate(0.12)' : 'none',
            opacity: muted ? 0.62 : 1,
          }}
        />
      </span>
      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span
          style={{
            color: 'var(--ink)',
            fontSize: 19,
            lineHeight: 1.05,
            fontWeight: 950,
          }}
        >
          {title}
        </span>
        <span style={{ color: 'rgba(15,23,42,0.62)', fontSize: 12, fontWeight: 750 }}>
          {description}
        </span>
        <span
          style={{
            color: 'rgba(15,23,42,0.54)',
            fontSize: 12,
            fontWeight: 850,
            fontVariantNumeric: 'tabular-nums',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            minWidth: 0,
          }}
        >
          {attention && (
            <span
              aria-label="Требуется действие"
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: 'rgba(220, 38, 38, 0.92)',
                boxShadow: '0 0 0 3px rgba(220, 38, 38, 0.14)',
                flex: '0 0 7px',
              }}
            />
          )}
          {meta}
        </span>
      </span>
      <ChevronRight
        aria-hidden="true"
        size={19}
        strokeWidth={2.7}
        style={{ justifySelf: 'end', color: 'rgba(15,23,42,0.54)' }}
      />
    </button>
  );
}
