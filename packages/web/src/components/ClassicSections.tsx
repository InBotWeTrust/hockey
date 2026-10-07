import { ChevronRight } from 'lucide-react';
const SECTION_ARTWORK_SIZE = 86;
const SECTION_ARTWORK = {
  bar: '/bar/restaurant.webp',
  achievements: '/achievements/first-goal.webp',
  daily: '/daily-game/start.webp',
  training: '/modes/training-evening.webp',
  amateur: '/modes/amateur-game-v3.webp',
  pro: '/modes/pro-game.webp',
  shop: '/modes/shop-retail-v2.webp',
  bonusGames: '/bonus-games/section-card-v5.webp',
} as const;

type SectionTone = 'active' | 'default' | 'muted';

function numberText(value: number): string {
  return new Intl.NumberFormat('ru-RU', { useGrouping: false }).format(value);
}
interface ClassicSectionsProps {
  dailyMeta: string;
  trainingMeta: string;
  achievementsMeta: readonly string[];
  sectionTasksActionCount: number;
  bonusGamesMeta: string;
  isAmateurUnlocked: boolean;
  amateurGoalsRemaining: number;
  navigate: (path: string) => void;
}
export function ClassicSections({
  dailyMeta,
  trainingMeta,
  achievementsMeta,
  sectionTasksActionCount,
  bonusGamesMeta,
  isAmateurUnlocked,
  amateurGoalsRemaining,
  navigate,
}: ClassicSectionsProps): JSX.Element {
  const openAmateurs = (): void => navigate('/?view=amateur&from=sections');
  return (
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
            meta={`${dailyMeta} бросков сегодня`}
            tone="active"
            size="wide"
            artworkSrc={SECTION_ARTWORK.daily}
            onClick={() => navigate('/daily')}
          />
          <QuickSectionCard
            title="Тренировка"
            meta={trainingMeta}
            tone="active"
            artworkSrc={SECTION_ARTWORK.training}
            onClick={() => navigate('/?view=training&from=sections')}
          />
          <QuickSectionCard
            title="Задания"
            meta={achievementsMeta}
            tone={sectionTasksActionCount > 0 ? 'active' : 'default'}
            artworkSrc={SECTION_ARTWORK.achievements}
            attention={sectionTasksActionCount > 0}
            onClick={() => navigate('/achievements')}
          />
          <QuickSectionCard
            title="Магазин"
            meta="Инвентарь и валюта"
            tone="default"
            size="tall"
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
            title="Бонусные игры"
            supportingText={bonusGamesMeta}
            tone="default"
            artworkSrc={SECTION_ARTWORK.bonusGames}
            onClick={() => navigate('/bonus-games')}
          />
          <SectionCard
            title="Бар"
            supportingText="Трансляции и обсуждения"
            tone="default"
            artworkSrc={SECTION_ARTWORK.bar}
            onClick={() => navigate('/bar')}
          />
          <SectionCard
            title="Любители"
            supportingText={
              isAmateurUnlocked
                ? 'Дуэли и турниры'
                : `Осталось ${numberText(amateurGoalsRemaining)} шайб до статуса «Любитель»`
            }
            tone="default"
            artworkSrc={SECTION_ARTWORK.amateur}
            onClick={openAmateurs}
          />
          <SectionCard
            title="Профессионалы"
            supportingText="Игры самого высокого уровня"
            tone="muted"
            artworkSrc={SECTION_ARTWORK.pro}
            onClick={() => navigate('/?view=pro&from=sections')}
          />
        </div>
      </section>
    </section>
  );
}

function QuickSectionCard({
  title,
  meta,
  tone,
  size = 'compact',
  artworkSrc,
  attention,
  onClick,
}: {
  title: string;
  meta: string | readonly string[];
  tone: Exclude<SectionTone, 'muted'>;
  size?: 'compact' | 'wide' | 'tall' | undefined;
  artworkSrc: string;
  attention?: boolean | undefined;
  onClick: () => void;
}): JSX.Element {
  const metaLines = typeof meta === 'string' ? [meta] : meta;
  return (
    <button
      type="button"
      className={`section-card-surface sections-quick-card sections-quick-card--${tone}${size === 'wide' ? ' sections-quick-card--wide' : ''}${size === 'tall' ? ' sections-quick-card--tall' : ''}`}
      aria-label={title}
      onClick={onClick}
    >
      <span className="sections-quick-card__art" aria-hidden="true">
        <img src={artworkSrc} alt="" draggable={false} />
      </span>
      <span className="sections-quick-card__content">
        <span className="sections-quick-card__title-row">
          <span className="sections-quick-card__title">{title}</span>
          {attention && (
            <span className="sections-quick-card__attention" aria-label="Требуется действие" />
          )}
        </span>
        <span
          className={`sections-quick-card__meta${metaLines.length > 1 ? ' sections-quick-card__meta--multiline' : ''}`}
        >
          {metaLines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      </span>
      {size !== 'compact' && (
        <ChevronRight className="card-chevron" aria-hidden="true" size={19} strokeWidth={2.7} />
      )}
    </button>
  );
}

function SectionCard({
  title,
  supportingText,
  tone,
  artworkSrc,
  progress,
  onClick,
}: {
  title: string;
  supportingText: string;
  tone: SectionTone;
  artworkSrc: string;
  progress?: number | undefined;
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
        <span
          style={{
            color: 'rgba(15,23,42,0.62)',
            fontSize: 12,
            fontWeight: 850,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {supportingText}
        </span>
      </span>
      <ChevronRight
        className="card-chevron"
        aria-hidden="true"
        size={19}
        strokeWidth={2.7}
        style={{ justifySelf: 'end' }}
      />
    </button>
  );
}
