import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface GlassSelectOption<T extends string> {
  value: T;
  label: string;
}

export function GlassSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<GlassSelectOption<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  const ref = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === selected?.value),
  );

  function openMenu(index = selectedIndex): void {
    setActiveIndex(Math.min(Math.max(index, 0), Math.max(options.length - 1, 0)));
    setOpen(true);
  }

  function selectActiveOption(): void {
    const option = options[activeIndex];
    if (option === undefined) return;
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
    if (event.key === 'Escape') {
      if (open) event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openMenu(selectedIndex);
        return;
      }
      const offset = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) =>
        options.length === 0 ? 0 : (current + offset + options.length) % options.length,
      );
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const nextIndex = event.key === 'Home' ? 0 : Math.max(options.length - 1, 0);
      if (!open) openMenu(nextIndex);
      else setActiveIndex(nextIndex);
      return;
    }
    if (open && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      selectActiveOption();
    }
  }

  function updateMenuRect(): void {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuRect({
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
    });
  }

  useEffect(() => {
    if (!open) return undefined;
    updateMenuRect();

    function onPointerDown(event: PointerEvent): void {
      const target = event.target as Node;
      if (
        !ref.current?.contains(target) &&
        !(target instanceof Element && target.closest('[data-glass-select-menu="true"]'))
      ) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false);
    }

    function onViewportChange(): void {
      updateMenuRect();
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 0 }}>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open ? `${listboxId}-option-${activeIndex}` : undefined}
        onKeyDown={handleKeyDown}
        onClick={() => {
          if (open) setOpen(false);
          else openMenu();
        }}
        style={{
          width: '100%',
          minWidth: 0,
          height: 44,
          borderRadius: 14,
          border: '1px solid rgba(255, 255, 255, 0.72)',
          background: 'rgba(255, 255, 255, 0.52)',
          color: 'var(--ink)',
          padding: '0 10px 0 12px',
          font: 'inherit',
          fontSize: 13,
          fontWeight: 800,
          outline: 'none',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.72)',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 18px',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected?.label ?? '-'}
        </span>
        <ChevronDown
          size={16}
          style={{
            transition: 'transform 140ms ease',
            transform: open ? 'rotate(180deg)' : 'none',
          }}
        />
      </button>

      {open &&
        menuRect !== null &&
        createPortal(
          <GlassSelectMenu
            ariaLabel={ariaLabel}
            id={listboxId}
            rect={menuRect}
            options={options}
            value={value}
            activeIndex={activeIndex}
            onActiveIndexChange={setActiveIndex}
            onSelect={(nextValue) => {
              onChange(nextValue);
              setOpen(false);
            }}
          />,
          document.body,
        )}
    </div>
  );
}

function GlassSelectMenu<T extends string>({
  ariaLabel,
  id,
  rect,
  options,
  value,
  activeIndex,
  onActiveIndexChange,
  onSelect,
}: {
  ariaLabel: string;
  id: string;
  rect: { top: number; left: number; width: number };
  options: Array<GlassSelectOption<T>>;
  value: T;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onSelect: (value: T) => void;
}): JSX.Element {
  return (
    <div
      id={id}
      role="listbox"
      aria-label={ariaLabel}
      data-glass-select-menu="true"
      style={{
        position: 'fixed',
        zIndex: 3000,
        top: rect.top,
        left: rect.left,
        width: rect.width,
        maxHeight: 'min(280px, calc(var(--app-viewport-height, 100dvh) - 24px))',
        overflowY: 'auto',
        borderRadius: 18,
        padding: 6,
        background: 'rgba(43, 56, 69, 0.96)',
        border: '1px solid rgba(255, 255, 255, 0.36)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 16px 34px rgba(15, 23, 42, 0.28)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
      }}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const active = index === activeIndex;
        return (
          <button
            key={option.value}
            id={`${id}-option-${index}`}
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={selected}
            data-active={active ? 'true' : 'false'}
            onMouseMove={() => onActiveIndexChange(index)}
            onClick={() => onSelect(option.value)}
            style={{
              width: '100%',
              minWidth: 0,
              height: 38,
              border: 'none',
              borderRadius: 12,
              background: active ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
              color: '#ffffff',
              padding: '0 10px',
              display: 'grid',
              gridTemplateColumns: '18px minmax(0, 1fr)',
              alignItems: 'center',
              gap: 8,
              font: 'inherit',
              fontSize: 13,
              fontWeight: 850,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            {selected ? <Check size={16} /> : <span />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
