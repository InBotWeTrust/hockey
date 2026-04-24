import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

export function SettingsSheet({ open, onClose, children, title = 'Настройки' }: SettingsSheetProps): JSX.Element | null {
  if (!open) return null;

  return (
    <>
      <style>{`
        @keyframes sheet-in {
          from { opacity: 0; transform: translateY(16px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes sheet-overlay-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      <div
        role="dialog"
        aria-label={title}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.35)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          zIndex: 250,
          animation: 'sheet-overlay-in 180ms ease',
        }}
      >
        <div
          className="glass"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 380,
            borderRadius: 24,
            padding: '18px 18px 20px',
            animation: 'sheet-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink)',
              }}
            >
              {title}
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label="Закрыть"
            >
              <X size={16} />
            </button>
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
