import type { ShotResult } from '@hockey/game-core';

export interface ResultModalProps {
  result: ShotResult;
  durationMs: number;
}

interface Style {
  gradient: string;
  title: string;
}

const STYLES: Record<ShotResult['type'], Style> = {
  goal: {
    gradient: 'linear-gradient(180deg, #ffffff 0%, #86efac 25%, #22c55e 60%, #15803d 100%)',
    title: 'ТОЧНО',
  },
  save: {
    gradient: 'linear-gradient(180deg, #ffffff 0%, #93c5fd 25%, #3b82f6 60%, #1d4ed8 100%)',
    title: 'СЭЙВ',
  },
  miss: {
    gradient: 'linear-gradient(180deg, #ffffff 0%, #fca5a5 25%, #ef4444 60%, #b91c1c 100%)',
    title: 'МИМО',
  },
};

export function ResultModal({ result, durationMs }: ResultModalProps): JSX.Element {
  const style = STYLES[result.type];

  return (
    <>
      <style>{`
@keyframes result-text {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
          10%  { opacity: 1; transform: translate(-50%, -50%) scale(1.18); }
          18%  { transform: translate(-50%, -50%) scale(0.93); }
          26%  { transform: translate(-50%, -50%) scale(1.05); }
          34%  { transform: translate(-50%, -50%) scale(1); }
          78%  { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, calc(-50% - 16px)) scale(0.92); }
        }
      `}</style>

      {/* Текст результата */}
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          width: '65vw',
          maxWidth: 560,
          minWidth: 260,
          zIndex: 300,
          textAlign: 'center',
          fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
          fontWeight: 900,
          fontSize: 'clamp(60px, 15vw, 104px)',
          lineHeight: 1,
          letterSpacing: 4,
          background: style.gradient,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          WebkitTextFillColor: 'transparent',
          WebkitTextStroke: '1.5px rgba(255,255,255,0.55)',
          filter: `
            drop-shadow(0 3px 0 rgba(0, 0, 0, 0.6))
            drop-shadow(0 8px 24px rgba(0, 0, 0, 0.45))
            drop-shadow(0 0 40px rgba(0, 0, 0, 0.4))
          `,
          animation: `result-text ${durationMs}ms cubic-bezier(0.22, 0.68, 0, 1.4) forwards`,
          pointerEvents: 'none',
          paddingLeft: 4,
        }}
      >
        {style.title}
      </div>
    </>
  );
}
