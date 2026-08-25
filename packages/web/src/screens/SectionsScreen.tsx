import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { fetchAchievements } from '../api/achievements.js';
import { apiFetch } from '../api/apiFetch.js';
import { fetchWeeklyChallenge } from '../api/weeklyChallenge.js';
import type { ProfileData } from './profileTypes.js';
import { useDailyStore } from '../stores/dailyStore.js';
import { useTrainingSessionStore } from '../stores/trainingSessionStore.js';
import { BONUS_GAME_SECTION_ARTWORK } from '../game/bonusGameAssets.js';
import { AccessibleModal } from '../components/AccessibleModal.js';

const DEFAULT_AMATEUR_UNLOCK_GOALS_REQUIRED = 300;
const SECTION_ARTWORK_SIZE = 86;

const SECTION_ARTWORK = {
  achievements: '/achievements/first-goal.webp',
  daily: '/daily-game/start.webp',
  training: '/modes/beginner.webp',
  amateur: '/modes/amateur.webp',
  tournaments: '/sprites/tournament-tableau.webp',
  pro: '/modes/pro.webp',
  shop: '/modes/shop.webp',
} as const;

type SectionTone = 'active' | 'default' | 'muted';

function numberText(value: number): string {
  return new Intl.NumberFormat('ru-RU', { useGrouping: false }).format(value);
}

function waitingActionText(value: number): string {
  if (value === 1) return '1 действие ждёт';
  const mod10 = value % 10;
  const mod100 = value % 100;
  const noun = mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'действия' : 'действий';
  return `${numberText(value)} ${noun} ждут`;
}

function waitingRewardText(value: number): string {
  if (value === 1) return '1 награда ждёт';
  const mod10 = value % 10;
  const mod100 = value % 100;
  const noun = mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'награды' : 'наград';
  return `${numberText(value)} ${noun} ждут`;
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
  const profileQuery = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: () => apiFetch<ProfileData>('/me'),
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
  const isAmateurUnlocked =
    profileQuery.data?.competitionLevel === 'amateur' ||
    profileQuery.data?.competitionLevel === 'professional' ||
    (dailyData?.lifetime_total_goals ?? 0) >= amateurUnlockGoalsRequired;
  const trainingShotsLimit = trainingData?.shots_limit ?? 500;
  const trainingShotsTaken = trainingData?.shots_taken ?? 0;
  const dailyShotsLimit = (dailyData?.shots_per_period ?? 30) * (dailyData?.total_periods ?? 3);
  const achievementsUnclaimedCount = achievementsQuery.data?.unclaimedCount ?? 0;
  const weeklyCanClaimReward =
    weeklyChallenge.data?.challenge?.canClaimReward === true ||
    (weeklyChallenge.data?.pendingRewards?.length ?? 0) > 0;
  const weeklyNeedsDecision =
    weeklyChallenge.data?.challenge?.canJoin === true || weeklyCanClaimReward;
  const sectionTasksActionCount =
    achievementsUnclaimedCount +
    (weeklyChallenge.data?.challenge?.canJoin === true ||
    weeklyChallenge.data?.challenge?.canClaimReward === true
      ? 1
      : 0) +
    (weeklyChallenge.data?.pendingRewards?.length ?? 0);
  const achievementsMeta =
    sectionTasksActionCount > achievementsUnclaimedCount
      ? waitingActionText(sectionTasksActionCount)
      : achievementsUnclaimedCount > 0
        ? waitingRewardText(achievementsUnclaimedCount)
        : 'Награды, серии и будущие цели';

  const openAmateurs = (): void => {
    if (!isAmateurUnlocked) {
      setLockedInfo({
        title: 'Не хватает шайб',
        text: `Для открытия любительского раздела нужно забить ${numberText(amateurUnlockGoalsRequired)} шайб в ежедневной игре.`,
      });
      return;
    }
    navigate('/?view=amateur&section=duels&from=sections');
  };

  const openTournaments = (): void => {
    if (!isAmateurUnlocked) {
      setLockedInfo({
        title: 'Нужен любительский уровень',
        text: 'Турниры доступны после открытия любительского уровня.',
      });
      return;
    }
    navigate('/?view=amateur&section=tournaments&from=sections');
  };

  const openBonusGames = (): void => {
    if (!isAmateurUnlocked) {
      setLockedInfo({
        title: 'Нужен любительский уровень',
        text: 'Бонусные игры доступны после открытия любительского уровня.',
      });
      return;
    }
    navigate('/bonus-games');
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
        <section className="sections-group" aria-labelledby="sections-quick-access-title">
          <h2 id="sections-quick-access-title" className="section-label sections-group__title">
            Быстрый доступ
          </h2>
          <div className="sections-quick-grid">
            <QuickSectionCard
              title="Ежедневная игра"
              meta={`${numberText(dailyData?.daily_total_shots ?? 0)}/${numberText(dailyShotsLimit)} бросков`}
              tone="active"
              artworkSrc={SECTION_ARTWORK.daily}
              onClick={() => navigate('/daily')}
            />
            <QuickSectionCard
              title="Тренировка"
              meta={`${trainingShotsTaken}/${trainingShotsLimit} бросков`}
              tone="active"
              artworkSrc={SECTION_ARTWORK.training}
              onClick={() => navigate('/?view=training&from=sections')}
            />
            <QuickSectionCard
              title="Задания"
              meta={sectionTasksActionCount > 0 ? achievementsMeta : 'Цели и награды'}
              tone={sectionTasksActionCount > 0 ? 'active' : 'default'}
              artworkSrc={SECTION_ARTWORK.achievements}
              attention={sectionTasksActionCount > 0 || weeklyNeedsDecision}
              onClick={() => navigate('/achievements')}
            />
            <QuickSectionCard
              title="Магазин"
              meta="Инвентарь и предметы"
              tone="default"
              artworkSrc={SECTION_ARTWORK.shop}
              onClick={() => navigate('/inventory')}
            />
          </div>
        </section>

        <section className="sections-group" aria-labelledby="sections-modes-title">
          <h2 id="sections-modes-title" className="section-label sections-group__title">
            Игровые режимы
          </h2>
          <div className="sections-mode-list">
            <SectionCard
              title="Любители"
              description="Дуэли один на один и соревновательный рейтинг"
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
              title="Бонусные игры"
              description="Серия тематических матчей и новые домашние площадки"
              meta={
                isAmateurUnlocked
                  ? 'Игры и награды за первое прохождение'
                  : 'Нужен любительский уровень'
              }
              tone={isAmateurUnlocked ? 'default' : 'muted'}
              artworkSrc={BONUS_GAME_SECTION_ARTWORK}
              onClick={openBonusGames}
            />
            <SectionCard
              title="Турниры"
              description="Регулярные чемпионаты, плей-офф, календарь и призы"
              meta={isAmateurUnlocked ? 'Каталог и мои заявки' : 'Нужен любительский уровень'}
              tone={isAmateurUnlocked ? 'default' : 'muted'}
              artworkSrc={SECTION_ARTWORK.tournaments}
              onClick={openTournaments}
            />
            <SectionCard
              title="Профессионалы"
              description="Игры самого высокого уровня"
              meta="Раздел в разработке"
              tone="muted"
              artworkSrc={SECTION_ARTWORK.pro}
              onClick={() => navigate('/?view=pro&from=sections')}
            />
          </div>
        </section>
      </section>

      {lockedInfo && (
        <AccessibleModal
          title={lockedInfo.title}
          copy={lockedInfo.text}
          onClose={() => setLockedInfo(null)}
        >
          <div className="modal-actions">
            <button
              type="button"
              className="modal-primary btn btn--cta"
              onClick={() => setLockedInfo(null)}
            >
              Понятно
            </button>
          </div>
        </AccessibleModal>
      )}
    </main>
  );
}

function QuickSectionCard({
  title,
  meta,
  tone,
  artworkSrc,
  attention,
  onClick,
}: {
  title: string;
  meta: string;
  tone: Exclude<SectionTone, 'muted'>;
  artworkSrc: string;
  attention?: boolean | undefined;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`section-card-surface sections-quick-card sections-quick-card--${tone}`}
      aria-label={title}
      onClick={onClick}
    >
      <span className="sections-quick-card__art" aria-hidden="true">
        <img src={artworkSrc} alt="" draggable={false} />
      </span>
      <span className="sections-quick-card__content">
        <span className="sections-quick-card__title">{title}</span>
        <span className="sections-quick-card__meta">
          {attention && <span className="sections-quick-card__attention" aria-label="Требуется действие" />}
          {meta}
        </span>
      </span>
    </button>
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
      className={`section-card-surface section-card-surface--${tone}`}
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
