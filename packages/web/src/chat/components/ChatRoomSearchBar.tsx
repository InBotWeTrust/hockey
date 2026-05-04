import { useEffect, useRef } from 'react';
import { Search } from 'lucide-react';

interface Props {
  open: boolean;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}

export function ChatRoomSearchBar({ open, value, placeholder, onChange }: Props): JSX.Element {
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      ref.current?.focus();
    } else if (value !== '') {
      onChange('');
    }
  }, [open, value, onChange]);

  return (
    <div
      aria-hidden={!open}
      style={{
        margin: '8px 14px 0',
        maxHeight: open ? 48 : 0,
        opacity: open ? 1 : 0,
        overflow: 'hidden',
        transition: 'max-height 180ms ease-out, opacity 140ms ease-out',
      }}
    >
      <div
        className="glass-dock-field"
        style={{
          width: '100%',
        }}
      >
        <Search size={14} color="var(--muted)" aria-hidden />
        <input
          ref={ref}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label="Поиск по чату"
          tabIndex={open ? 0 : -1}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--ink)',
            fontSize: 14,
            fontFamily: 'inherit',
          }}
        />
      </div>
    </div>
  );
}
