export interface PeriodSummaryModalProps {
  periodNumber: number;
  goals: number;
  shots: number;
  closedReason: 'quota' | 'timeout' | 'day_end';
  onClose: () => void;
}

const REASON_LABEL: Record<PeriodSummaryModalProps['closedReason'], string> = {
  quota: 'Квота бросков выполнена',
  timeout: 'Время вышло',
  day_end: 'Период прерван',
};

export function PeriodSummaryModal({
  periodNumber,
  goals,
  shots,
  closedReason,
  onClose,
}: PeriodSummaryModalProps): JSX.Element {
  const accuracy = shots > 0 ? Math.round((goals / shots) * 100) : 0;
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
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.22em',
            fontWeight: 700,
            color: 'var(--muted)',
            textTransform: 'uppercase',
          }}
        >
          {REASON_LABEL[closedReason]}
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: '-0.02em',
          }}
        >
          {periodNumber}-й период завершён
        </div>

        <div
          style={{
            marginTop: 22,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 10,
          }}
        >
          <Stat label="ГОЛЫ" value={String(goals)} />
          <Stat label="БРОСКИ" value={String(shots)} />
          <Stat label="ТОЧНОСТЬ" value={`${accuracy}%`} />
        </div>

        <button
          type="button"
          className="btn btn--cta"
          onClick={onClose}
          style={{ marginTop: 22, width: '100%', paddingBlock: 16 }}
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}): JSX.Element {
  return (
    <div
      style={{
        padding: '10px 6px',
        borderRadius: 14,
        background: 'rgba(255, 255, 255, 0.55)',
        border: '1px solid rgba(15, 23, 42, 0.06)',
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: '0.18em',
          fontWeight: 700,
          color: 'var(--muted)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 22,
          fontWeight: 800,
          color: accent ?? 'var(--ink)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}
