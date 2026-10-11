export function DuelKindPreferenceButton({
  label,
  checked,
  active,
  onClick,
  disabled = false,
  ariaDisabled = false,
  title,
}: {
  label: string;
  checked: boolean;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  ariaDisabled?: boolean;
  title?: string | undefined;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-disabled={ariaDisabled}
      disabled={disabled}
      title={title}
      onClick={onClick}
      style={{
        minWidth: 0,
        minHeight: 30,
        borderRadius: 999,
        border: active ? '1px solid rgba(15,23,42,0.32)' : '1px solid rgba(255,255,255,0.7)',
        background: active ? 'var(--liquid-selected-bg)' : 'var(--liquid-inset-bg)',
        color: active ? '#fff' : 'var(--ink)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 9px',
        fontSize: 10,
        fontWeight: 900,
        lineHeight: 1,
        letterSpacing: '0',
        boxShadow: 'none',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        opacity: ariaDisabled ? 0.58 : 1,
      }}
    >
      {label}
    </button>
  );
}
