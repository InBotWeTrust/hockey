import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Filter } from 'lucide-react';
import { GOALIES, type GoaliePatternId } from '@hockey/game-core';

const PATTERN_LABEL: Record<GoaliePatternId, string> = {
  linear: 'Линейный',
  sine: 'Синусоида',
  dash: 'Рывки',
  feint: 'Финты',
};

const PATTERN_GRADIENT: Record<GoaliePatternId, string> = {
  linear: 'linear-gradient(135deg, #60a5fa 0%, #1d4ed8 100%)',
  sine: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
  dash: 'linear-gradient(135deg, #10b981 0%, #065f46 100%)',
  feint: 'linear-gradient(135deg, #c084fc 0%, #6b21a8 100%)',
};

type FilterId = 'all' | 'open' | 'beaten';

export function GoalieListScreen(): JSX.Element {
  const [filter, setFilter] = useState<FilterId>('all');

  return (
    <main
      className="screen"
      style={{
        paddingBottom: 16,
      }}
    >
      <header className="header-bar glass">
        <div className="header-bar__title">Лестница вратарей</div>
        <button type="button" className="icon-btn" aria-label="Фильтр">
          <Filter size={16} />
        </button>
      </header>

      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '0 14px 10px',
          overflowX: 'auto',
        }}
      >
        <FilterChip label="Все" active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterChip label="Открыты" active={filter === 'open'} onClick={() => setFilter('open')} />
        <FilterChip
          label="Пройдены"
          active={filter === 'beaten'}
          onClick={() => setFilter('beaten')}
        />
      </div>

      <div
        style={{
          padding: '0 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {GOALIES.map((g, idx) => {
          const initial = g.name.charAt(0).toUpperCase();
          return (
            <Link
              key={g.id}
              to={`/duel/${g.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div
                className="glass"
                style={{
                  padding: '14px 16px',
                  borderRadius: 20,
                  display: 'grid',
                  gridTemplateColumns: '48px 1fr auto',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    fontWeight: 800,
                    color: '#ffffff',
                    background: PATTERN_GRADIENT[g.pattern],
                    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.18)',
                  }}
                >
                  {initial}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{g.name}</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
                    <MetaChip>#{idx + 1}</MetaChip>
                    <MetaChip>HP {g.hp}</MetaChip>
                    <MetaChip>{PATTERN_LABEL[g.pattern]}</MetaChip>
                  </div>
                </div>
                <div
                  style={{
                    padding: '8px 14px',
                    borderRadius: 999,
                    background: 'rgba(15, 23, 42, 0.9)',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                  }}
                >
                  Играть
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button type="button" onClick={onClick} className={active ? 'chip chip--active' : 'chip'}>
      {label}
    </button>
  );
}

function MetaChip({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 600,
        padding: '3px 8px',
        borderRadius: 999,
        background: 'rgba(15, 23, 42, 0.08)',
        color: 'var(--muted)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </span>
  );
}
