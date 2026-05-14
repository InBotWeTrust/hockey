import type { ShotResult } from '@hockey/game-core';

export interface ResultModalProps {
  result: ShotResult;
  durationMs: number;
  subText?: string | null;
}

interface Theme {
  title: string;
  color: string;
  glow: string;
}

const THEMES: Record<ShotResult['type'], Theme> = {
  goal: {
    title: 'ГОЛ',
    color: '#15803d',
    glow: 'rgba(34, 197, 94, 0.35)',
  },
  save: {
    title: 'СЭЙВ',
    color: '#1d4ed8',
    glow: 'rgba(59, 130, 246, 0.35)',
  },
  miss: {
    title: 'МИМО',
    color: '#b91c1c',
    glow: 'rgba(225, 29, 72, 0.35)',
  },
};

export function ResultModal({ result, durationMs }: ResultModalProps): JSX.Element {
  const theme = THEMES[result.type];

  return (
    <>
      <style>{`
        @keyframes result-card {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.78); }
          14%  { opacity: 1; transform: translate(-50%, -50%) scale(1.04); }
          28%  { transform: translate(-50%, -50%) scale(0.99); }
          40%  { transform: translate(-50%, -50%) scale(1); }
          80%  { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, calc(-50% - 12px)) scale(0.97); }
        }
      `}</style>

      <div
        role="status"
        aria-live="polite"
        className="glass"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          zIndex: 300,
          padding: '22px 48px',
          borderRadius: 28,
          textAlign: 'center',
          pointerEvents: 'none',
          boxShadow: `0 20px 60px rgba(15, 23, 42, 0.22), 0 0 80px ${theme.glow}`,
          animation: `result-card ${durationMs}ms cubic-bezier(0.22, 0.68, 0, 1.4) forwards`,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 900,
            fontSize: 'clamp(56px, 14vw, 104px)',
            lineHeight: 1,
            letterSpacing: '0.06em',
            color: theme.color,
            textShadow: '0 1px 0 rgba(255, 255, 255, 0.6)',
          }}
        >
          {theme.title}
        </div>
      </div>
    </>
  );
}
