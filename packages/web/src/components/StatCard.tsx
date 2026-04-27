interface StatCardProps {
  label: string;
  value: string;
  suffix?: string;
}

export function StatCard({ label, value, suffix }: StatCardProps): JSX.Element {
  return (
    <div
      className="glass"
      style={{
        padding: '12px 14px',
        borderRadius: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: 'var(--muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
        {value}
        {suffix && <small style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>{suffix}</small>}
      </span>
    </div>
  );
}
