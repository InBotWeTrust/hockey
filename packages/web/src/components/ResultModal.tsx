import type { ShotResult } from '@hockey/game-core';

export interface ResultModalProps {
  result: ShotResult;
  durationMs: number;
  subText?: string | null;
  displayKind?: ResultModalKind | undefined;
}

export type ResultModalKind = ShotResult['type'] | 'post';

interface Theme {
  title: string;
  glow: string;
  glowSoft: string;
  titleSize?: string;
  letterSpacing?: string;
}

const THEMES: Record<ResultModalKind, Theme> = {
  goal: {
    title: 'ГОЛ',
    glow: 'rgba(21, 128, 61, 0.54)',
    glowSoft: 'rgba(21, 128, 61, 0.2)',
  },
  save: {
    title: 'СЭЙВ',
    glow: 'rgba(14, 165, 233, 0.58)',
    glowSoft: 'rgba(14, 165, 233, 0.2)',
  },
  miss: {
    title: 'МИМО',
    glow: 'rgba(239, 68, 68, 0.58)',
    glowSoft: 'rgba(239, 68, 68, 0.2)',
  },
  post: {
    title: 'ШТАНГА',
    glow: 'rgba(239, 68, 68, 0.62)',
    glowSoft: 'rgba(239, 68, 68, 0.22)',
    titleSize: 'clamp(42px, 11.5vw, 78px)',
    letterSpacing: '0.04em',
  },
};

export function ResultModal({ result, durationMs, displayKind }: ResultModalProps): JSX.Element {
  const theme = THEMES[displayKind ?? result.type];

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
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          zIndex: 300,
          padding: '22px 50px',
          borderRadius: 28,
          background: 'rgba(172, 184, 198, 0.74)',
          border: '1.5px solid rgba(255, 255, 255, 0.86)',
          backdropFilter: 'blur(18px) saturate(115%)',
          WebkitBackdropFilter: 'blur(18px) saturate(115%)',
          textAlign: 'center',
          pointerEvents: 'none',
          maxWidth: 'calc(100vw - 56px)',
          boxShadow: [
            `0 0 0 2px ${theme.glowSoft}`,
            `0 0 34px ${theme.glow}`,
            `0 0 86px ${theme.glowSoft}`,
            '0 22px 58px rgba(15, 23, 42, 0.24)',
            'inset 0 1px 0 rgba(255, 255, 255, 0.38)',
          ].join(', '),
          animation: `result-card ${durationMs}ms cubic-bezier(0.22, 0.68, 0, 1.4) forwards`,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 900,
            fontSize: theme.titleSize ?? 'clamp(56px, 14vw, 104px)',
            lineHeight: 1,
            letterSpacing: theme.letterSpacing ?? '0.06em',
            color: '#111827',
            textShadow: '0 1px 0 rgba(255, 255, 255, 0.42)',
          }}
        >
          {theme.title}
        </div>
      </div>
    </>
  );
}
