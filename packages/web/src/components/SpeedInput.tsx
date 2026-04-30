import { RotateCcw } from 'lucide-react';

export interface SpeedInputProps {
  label: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  onReset: () => void;
}

export function SpeedInput({
  label,
  value,
  defaultValue,
  min,
  max,
  step,
  onChange,
  onReset,
}: SpeedInputProps): JSX.Element {
  const isDefault = Math.abs(value - defaultValue) < step / 2;

  return (
    <div
      className="glass"
      style={{
        width: '100%',
        boxSizing: 'border-box',
        borderRadius: 14,
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontSize: 10,
            letterSpacing: 0.8,
            color: 'var(--muted)',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
            {value.toFixed(2)}
          </span>
          <button
            type="button"
            onClick={onReset}
            disabled={isDefault}
            style={{
              background: 'none',
              border: 'none',
              padding: 2,
              cursor: isDefault ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              opacity: isDefault ? 0.2 : 0.6,
              transition: 'opacity 0.15s',
            }}
            aria-label="Сбросить"
          >
            <RotateCcw size={11} color="var(--ink)" />
          </button>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--ink)', cursor: 'pointer' }}
      />
    </div>
  );
}
