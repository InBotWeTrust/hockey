import { Link } from 'react-router-dom';
import { GOALIES, type GoaliePatternId } from '@hockey/game-core';

const PATTERN_LABEL: Record<GoaliePatternId, string> = {
  linear: 'Линейный',
  sine: 'Синусоида',
  dash: 'Рывки',
  feint: 'Финты',
};

export function GoalieListScreen(): JSX.Element {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#e8f1ff',
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ color: '#0b2e5c', margin: '0 0 8px' }}>Ultimate Hockey</h1>
      <p style={{ color: '#4a6a8a', marginTop: 0 }}>
        Тренировочный режим. Выбирай босса.
      </p>
      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          marginTop: 16,
        }}
      >
        {GOALIES.map((g, idx) => (
          <Link
            key={g.id}
            to={`/duel/${g.id}`}
            style={{
              display: 'block',
              padding: 16,
              background: 'white',
              borderRadius: 12,
              boxShadow: '0 2px 8px rgba(11,46,92,0.08)',
              textDecoration: 'none',
              color: '#0b2e5c',
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.6 }}>#{idx + 1}</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{g.name}</div>
            <div style={{ fontSize: 13, color: '#4a6a8a', marginTop: 4 }}>
              {PATTERN_LABEL[g.pattern]} · HP {g.hp}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
