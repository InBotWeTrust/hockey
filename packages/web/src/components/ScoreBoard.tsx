export interface ScoreBoardProps {
  period: number;
  periodsTotal?: number;
  timer: string;
  timerLabel?: string | undefined;
  goals: number;
  shots: number;
  shotsTotal?: number;
}

const LABEL_COLOR = 'rgba(148, 163, 184, 0.85)';
const DIM = 'rgba(148, 163, 184, 0.35)';
const BORDER = 'rgba(255, 255, 255, 0.08)';

export function ScoreBoard({
  period,
  periodsTotal = 3,
  timer,
  timerLabel = 'ВРЕМЯ',
  goals,
  shots,
  shotsTotal,
}: ScoreBoardProps): JSX.Element {
  const periodNums = Array.from({ length: periodsTotal }, (_, i) => i + 1);
  const goalsStr = String(goals).padStart(2, '0');
  const shotsStr = typeof shotsTotal === 'number'
    ? `${String(shots).padStart(2, '0')}/${String(shotsTotal).padStart(2, '0')}`
    : String(shots).padStart(2, '0');

  return (
    <div
      style={{
        padding: '10px 14px 12px',
        borderRadius: 18,
        background: 'rgba(15, 23, 42, 0.82)',
        backdropFilter: 'blur(14px) saturate(140%)',
        WebkitBackdropFilter: 'blur(14px) saturate(140%)',
        border: `1px solid ${BORDER}`,
        boxShadow:
          '0 10px 28px rgba(15, 23, 42, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        display: 'grid',
        gridTemplateColumns: '1.3fr 1fr 1.1fr 1.1fr',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Column label="ПЕРИОД">
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
          {periodNums.map((n) => (
            <span
              key={n}
              style={{
                display: 'inline-flex',
                width: 20,
                height: 20,
                borderRadius: 5,
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 700,
                background: n === period ? 'var(--red)' : 'transparent',
                border: n === period ? 'none' : `1px solid ${DIM}`,
                color: n === period ? '#ffffff' : DIM,
                boxShadow: n === period ? '0 0 10px rgba(225, 29, 72, 0.55)' : 'none',
                transition: 'background 0.2s',
              }}
            >
              {n}
            </span>
          ))}
        </div>
      </Column>

      <Column label="ШАЙБЫ">
        <LedNumber value={goalsStr} color="#f1f5f9" />
      </Column>

      <Column label="БРОСКИ">
        <LedNumber value={shotsStr} color="#f1f5f9" />
      </Column>

      <Column label={timerLabel}>
        <LedNumber value={timer} color="#f43f5e" />
      </Column>
    </div>
  );
}

function Column({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, lineHeight: 1 }}>
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.22em',
          color: LABEL_COLOR,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function LedNumber({ value, color }: { value: string; color: string }): JSX.Element {
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 20,
        fontWeight: 700,
        letterSpacing: '0.04em',
        fontVariantNumeric: 'tabular-nums',
        color,
        textShadow: `0 0 10px ${color}80, 0 0 2px ${color}`,
      }}
    >
      {value}
    </span>
  );
}
