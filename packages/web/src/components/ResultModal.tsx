import type { ShotResult } from '@hockey/game-core';

export interface ResultModalProps {
  result: ShotResult;
  durationMs: number;
}

interface Style {
  gradient: string;      // вертикальный градиент текста (top → bottom)
  title: string;
}

const STYLES: Record<ShotResult['type'], Style> = {
  goal: {
    gradient: 'linear-gradient(180deg, #86efac 0%, #22c55e 55%, #15803d 100%)',
    title: 'ТОЧНО',
  },
  save: {
    gradient: 'linear-gradient(180deg, #93c5fd 0%, #3b82f6 55%, #1d4ed8 100%)',
    title: 'СЭЙВ',
  },
  miss: {
    gradient: 'linear-gradient(180deg, #fca5a5 0%, #ef4444 55%, #b91c1c 100%)',
    title: 'МИМО',
  },
};

const ANIMATION = 'result-text';

export function ResultModal({ result, durationMs }: ResultModalProps): JSX.Element {
  const style = STYLES[result.type];

  return (
    <>
      <style>{`
        @keyframes ${ANIMATION} {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
          14%  { opacity: 1; transform: translate(-50%, -50%) scale(1.06); }
          26%  { transform: translate(-50%, -50%) scale(1); }
          82%  { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, calc(-50% - 12px)) scale(0.96); }
        }
      `}</style>

      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          width: '60vw',
          maxWidth: 540,
          minWidth: 280,
          zIndex: 300,
          textAlign: 'center',
          fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
          fontWeight: 900,
          fontSize: 'clamp(56px, 13vw, 96px)',
          lineHeight: 1,
          letterSpacing: 6,
          // Цветной градиентный fill через background-clip
          background: style.gradient,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          WebkitTextFillColor: 'transparent',
          // Тёмная многослойная тень — одинаковая для всех типов результата.
          filter: `
            drop-shadow(0 2px 0 rgba(0, 0, 0, 0.55))
            drop-shadow(0 6px 18px rgba(0, 0, 0, 0.5))
            drop-shadow(0 0 28px rgba(0, 0, 0, 0.55))
          `,
          animation: `${ANIMATION} ${durationMs}ms cubic-bezier(0.22, 0.68, 0, 1.3) forwards`,
          pointerEvents: 'none',
          paddingLeft: 6, // компенсация letter-spacing
        }}
      >
        {style.title}
      </div>
    </>
  );
}
