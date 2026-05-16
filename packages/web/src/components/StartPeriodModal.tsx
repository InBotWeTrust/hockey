import type { ReactNode } from 'react';
import { Home } from 'lucide-react';

export interface StartPeriodModalProps {
  nextPeriod: number;
  totalPeriods: number;
  shotsPerPeriod: number;
  isFirstPeriod: boolean;
  pending: boolean;
  title?: string;
  lead?: string;
  periodDescription?: string;
  topSlot?: ReactNode;
  onHome?: () => void;
  onStart: () => void;
}

const ORDINAL_GENITIVE: Record<number, string> = {
  1: '1-го',
  2: '2-х',
  3: '3-х',
  4: '4-х',
  5: '5-ти',
};

export function StartPeriodModal({
  nextPeriod,
  totalPeriods,
  shotsPerPeriod,
  isFirstPeriod,
  pending,
  title,
  lead,
  periodDescription,
  topSlot,
  onHome,
  onStart,
}: StartPeriodModalProps): JSX.Element {
  const heading = title ?? (isFirstPeriod ? 'Сегодняшняя игра' : 'Перерыв окончен');
  const leadText =
    lead ??
    `Сейчас начнётся ${nextPeriod}-й период из ${
      ORDINAL_GENITIVE[totalPeriods] ?? `${totalPeriods}-х`
    }`;
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        background: 'rgba(15, 23, 42, 0.18)',
        backdropFilter: 'blur(6px) saturate(130%)',
        WebkitBackdropFilter: 'blur(6px) saturate(130%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        animation: 'period-summary-fade 220ms ease-out',
      }}
    >
      <style>{`
        @keyframes period-summary-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes period-summary-pop {
          from { opacity: 0; transform: translateY(8px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div
        style={{
          width: '100%',
          maxWidth: 360,
          padding: '28px 24px 22px',
          borderRadius: 28,
          textAlign: 'center',
          background:
            'linear-gradient(180deg, rgba(255, 255, 255, 0.90) 0%, rgba(241, 245, 249, 0.88) 100%)',
          backdropFilter: 'blur(22px) saturate(160%)',
          WebkitBackdropFilter: 'blur(22px) saturate(160%)',
          border: '1px solid rgba(255, 255, 255, 0.65)',
          boxShadow:
            '0 30px 80px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(15, 23, 42, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
          animation: 'period-summary-pop 280ms cubic-bezier(0.22, 0.68, 0.18, 1.2)',
          position: 'relative',
        }}
      >
        {topSlot && <div style={{ marginBottom: 18 }}>{topSlot}</div>}
        <div
          style={{
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: '-0.02em',
          }}
        >
          {heading}
        </div>

        <div
          style={{
            marginTop: 8,
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--ink)',
          }}
        >
          {leadText}
        </div>

        <div
          style={{
            marginTop: 10,
            color: 'var(--muted)',
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          {periodDescription ?? `20 минут и ${shotsPerPeriod} бросков.`}
        </div>

        <div
          style={{
            marginTop: 22,
            display: 'flex',
            alignItems: 'stretch',
            gap: 10,
          }}
        >
          {onHome && (
            <button
              type="button"
              aria-label="Вернуться к режимам"
              title="К режимам"
              onClick={onHome}
              className="icon-btn icon-btn--dark"
              style={{
                width: 56,
                height: 56,
                borderRadius: 20,
              }}
            >
              <Home size={22} />
            </button>
          )}
          <button
            type="button"
            className="btn btn--cta"
            onClick={onStart}
            disabled={pending}
            style={{ flex: 1, minWidth: 0, paddingBlock: 16 }}
          >
            Начать {nextPeriod}-й период
          </button>
        </div>
      </div>
    </div>
  );
}
