import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Dumbbell, ShoppingBag, Swords, Trophy } from 'lucide-react';
import { useDailyStore } from '../stores/dailyStore.js';
import { useTrainingSessionStore } from '../stores/trainingSessionStore.js';

const DEFAULT_AMATEUR_UNLOCK_GOALS_REQUIRED = 1000;

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
    (dailyData?.lifetime_total_goals ?? 0) >= amateurUnlockGoalsRequired;
  const trainingShotsLimit = trainingData?.shots_limit ?? 500;
  const trainingShotsTaken = trainingData?.shots_taken ?? 0;

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
          title="Тренировка"
          description="Периоды на выбор, броски без риска для дневной игры"
          meta={`${trainingShotsTaken}/${trainingShotsLimit} бросков сегодня`}
          tone="active"
          icon={<Dumbbell size={24} strokeWidth={2.3} />}
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
          icon={<Swords size={24} strokeWidth={2.3} />}
          progress={
            amateurUnlockGoalsRequired > 0
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
          icon={<Trophy size={24} strokeWidth={2.3} />}
          onClick={() => navigate('/?view=pro&from=sections')}
        />
        <SectionCard
          title="Магазин"
          description="Валюта, инвентарь и предметы"
          meta="Токены, звёзды и экипировка"
          tone="default"
          icon={<ShoppingBag size={24} strokeWidth={2.3} />}
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
  icon,
  progress,
  onClick,
}: {
  title: string;
  description: string;
  meta: string;
  tone: SectionTone;
  icon: JSX.Element;
  progress?: number;
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
        gridTemplateColumns: '58px minmax(0, 1fr) 20px',
        gap: 12,
        alignItems: 'center',
        width: '100%',
        minHeight: 108,
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
        aria-hidden="true"
        style={{
          width: 58,
          height: 58,
          borderRadius: 18,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: muted ? 'rgba(15,23,42,0.42)' : 'var(--ink)',
          background: muted ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.62)',
          border: '1px solid rgba(255,255,255,0.72)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.72)',
        }}
      >
        {icon}
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
          }}
        >
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
