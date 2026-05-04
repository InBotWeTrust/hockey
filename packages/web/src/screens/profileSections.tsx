import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { CompetitionLevel, ProfileAchievement, ProfileStats } from './profileTypes.js';

const LEVEL_LABELS: Record<CompetitionLevel, string> = {
  beginner: 'Новичок',
  amateur: 'Любитель',
  professional: 'Профессионал',
};

export const EMPTY_PROFILE_STATS: ProfileStats = {
  shots: 0,
  goals: 0,
  accuracy: 0,
  playStreakDays: 0,
  bestPlayStreakDays: 0,
};

export function formatProfileNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

export function getLevelLabel(level: CompetitionLevel | undefined): string {
  return level ? LEVEL_LABELS[level] : '-';
}

export function ProfileStatCard({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}): JSX.Element {
  return (
    <div
      className="glass"
      style={{
        minWidth: 0,
        minHeight: 74,
        padding: '12px 10px',
        borderRadius: 16,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 8,
      }}
    >
      <span
        style={{
          minWidth: 0,
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--muted)',
          textTransform: 'uppercase',
          overflowWrap: 'anywhere',
        }}
      >
        {label}
      </span>
      <span
        style={{
          minWidth: 0,
          fontSize: 21,
          lineHeight: 1,
          fontWeight: 800,
          color: 'var(--ink)',
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function ProfileStatsGrid({
  stats,
  columns = 4,
  style,
}: {
  stats: ProfileStats;
  columns?: 2 | 4;
  style?: CSSProperties;
}): JSX.Element {
  const currentStreakDays = stats.playStreakDays;
  const bestStreakDays = stats.bestPlayStreakDays ?? stats.playStreakDays;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: 8,
        ...style,
      }}
    >
      <ProfileStatCard label="Броски" value={formatProfileNumber(stats.shots)} />
      <ProfileStatCard label="Голы" value={formatProfileNumber(stats.goals)} />
      <ProfileStatCard label="Точность" value={`${stats.accuracy}%`} />
      <ProfileStatCard
        label="Дней подряд"
        value={
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, minWidth: 0 }}>
            <span>{formatProfileNumber(currentStreakDays)}</span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: 'rgba(71, 85, 105, 0.68)',
              }}
            >
              ({formatProfileNumber(bestStreakDays)})
            </span>
          </span>
        }
      />
    </div>
  );
}

export function AchievementTile({
  achievement,
  onOpen,
}: {
  achievement: ProfileAchievement;
  onOpen: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="achievement-tile"
      data-no-drag-scroll="true"
      aria-label={`${achievement.title}: ${achievement.isUnlocked ? 'получено' : 'не получено'}. Подробнее`}
      onClick={onOpen}
      style={{
        width: 84,
        flex: '0 0 84px',
        padding: 0,
        border: 0,
        background: 'transparent',
        cursor: 'pointer',
        color: 'var(--ink)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        textAlign: 'center',
        scrollSnapAlign: 'start',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          overflow: 'hidden',
          position: 'relative',
          background: 'rgba(15, 23, 42, 0.08)',
          flexShrink: 0,
          border: '1px solid rgba(255,255,255,0.82)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 8px 18px rgba(15,23,42,0.12)',
        }}
      >
        <img
          src={achievement.photoUrl}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            filter: achievement.isUnlocked ? 'none' : 'grayscale(1) saturate(0.1)',
            opacity: achievement.isUnlocked ? 1 : 0.58,
          }}
        />
      </div>
      <span
        style={{
          height: 25,
          width: '100%',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          fontSize: 10,
          lineHeight: 1.25,
          fontWeight: 700,
          color: 'var(--muted)',
          textTransform: 'uppercase',
          overflowWrap: 'anywhere',
        }}
      >
        {achievement.id === 'first-game' ? (
          <>
            Первая
            <br />
            игра
          </>
        ) : achievement.id === 'pro-ticket' ? (
          <>
            Билет в
            <br />
            про
          </>
        ) : (
          achievement.title
        )}
      </span>
    </button>
  );
}

export function ProfileAchievementsSection({
  achievements,
  onOpenAchievement,
  style,
  labelStyle,
}: {
  achievements: ProfileAchievement[];
  onOpenAchievement: (achievement: ProfileAchievement) => void;
  style?: CSSProperties;
  labelStyle?: CSSProperties;
}): JSX.Element {
  const unlockedAchievements = achievements.filter((achievement) => achievement.isUnlocked).length;

  return (
    <>
      <div className="section-label" style={{ marginBottom: 8, ...labelStyle }}>
        Достижения
        {achievements.length > 0 ? ` (${unlockedAchievements}/${achievements.length})` : ''}
      </div>
      <div
        className="glass"
        style={{
          margin: '0 14px 14px',
          padding: '14px 12px',
          borderRadius: 22,
          minHeight: 121,
          overflow: 'hidden',
          ...style,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            minHeight: 95,
            overflowX: 'auto',
            overflowY: 'hidden',
            overscrollBehaviorX: 'contain',
            scrollSnapType: 'x proximity',
          }}
        >
          {achievements.map((achievement) => (
            <AchievementTile
              key={achievement.id}
              achievement={achievement}
              onOpen={() => onOpenAchievement(achievement)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

export function AchievementDetailsSheet({
  achievement,
  onClose,
}: {
  achievement: ProfileAchievement;
  onClose: () => void;
}): JSX.Element {
  const status = achievement.isUnlocked ? 'Получено' : 'Не получено';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={achievement.title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.35)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        className="glass"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 320,
          maxHeight: 'calc(100dvh - 40px - var(--app-safe-top) - var(--app-safe-bottom))',
          overflowY: 'auto',
          borderRadius: 24,
          padding: '22px 22px 18px',
          color: 'var(--ink)',
          position: 'relative',
        }}
      >
        <button
          type="button"
          className="icon-btn"
          data-no-drag-scroll="true"
          aria-label="Закрыть"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 34,
            height: 34,
            background: 'rgba(255,255,255,0.62)',
          }}
        >
          <X size={16} />
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr)', gap: 14 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              overflow: 'hidden',
              background: 'rgba(15, 23, 42, 0.08)',
              border: '1px solid rgba(255,255,255,0.82)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 8px 18px rgba(15,23,42,0.12)',
              alignSelf: 'start',
            }}
          >
            <img
              src={achievement.photoUrl}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                filter: achievement.isUnlocked ? 'none' : 'grayscale(1) saturate(0.1)',
                opacity: achievement.isUnlocked ? 1 : 0.58,
              }}
            />
          </div>
          <div
            style={{
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 7,
            }}
          >
            <span
              className={achievement.isUnlocked ? 'pill pill--dark' : 'pill'}
              style={{
                alignSelf: 'flex-start',
                padding: '5px 10px',
                fontSize: 11,
                letterSpacing: 0,
              }}
            >
              {status}
            </span>
            <h3
              style={{
                margin: 0,
                fontSize: 19,
                lineHeight: 1.15,
                fontWeight: 900,
                overflowWrap: 'anywhere',
              }}
            >
              {achievement.title}
            </h3>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14, lineHeight: 1.45 }}>
            {achievement.description}
          </p>
          <div
            style={{
              color: 'var(--muted)',
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: 'var(--ink)', fontWeight: 900 }}>Цель: </strong>
            {achievement.requirement}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
