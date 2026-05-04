export interface PeriodSummaryModalProps {
  periodNumber: number;
  goals: number;
  shots: number;
  closedReason: 'quota' | 'timeout' | 'day_end';
  onClose: () => void;
}

const REASON_LABEL: Record<PeriodSummaryModalProps['closedReason'], string> = {
  quota: 'Лимит бросков выполнен',
  timeout: 'Время периода вышло',
  day_end: 'День завершился',
};

export function PeriodSummaryModal({
  periodNumber,
  goals,
  shots,
  closedReason,
  onClose,
}: PeriodSummaryModalProps): JSX.Element {
  const accuracy = shots > 0 ? Math.round((goals / shots) * 100) : 0;
  const title = `${periodNumber}-й период завершён`;

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="modal-backdrop">
      <div className="modal-card" style={{ textAlign: 'center' }}>
        <div
          style={{
            color: 'var(--muted)',
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          {REASON_LABEL[closedReason]}
        </div>
        <h2 className="modal-title" style={{ marginTop: 8, fontSize: 23 }}>
          {title}
        </h2>

        <div
          aria-label={`Итого за период: ${goals} голов из ${shots} бросков, точность ${accuracy}%`}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 8,
            marginTop: 22,
          }}
        >
          <PeriodSummaryStat label="Голы" value={String(goals)} />
          <PeriodSummaryStat label="Броски" value={String(shots)} />
          <PeriodSummaryStat label="Точность" value={`${accuracy}%`} />
        </div>

        <div className="modal-actions">
          <button type="button" className="modal-primary btn btn--cta" onClick={onClose}>
            Продолжить
          </button>
        </div>
      </div>
    </div>
  );
}

function PeriodSummaryStat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div
      style={{
        minWidth: 0,
        padding: '12px 6px',
        borderRadius: 14,
        background: 'rgba(255, 255, 255, 0.5)',
        border: '1px solid rgba(255, 255, 255, 0.7)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
      }}
    >
      <div
        style={{
          color: 'rgba(15, 23, 42, 0.58)',
          fontSize: 9,
          fontWeight: 900,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          color: 'var(--ink)',
          fontSize: 22,
          fontWeight: 950,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}
