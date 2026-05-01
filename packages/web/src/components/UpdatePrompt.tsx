import { useRegisterSW } from 'virtual:pwa-register/react';

export function UpdatePrompt(): JSX.Element | null {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(78px + max(12px, var(--app-safe-bottom)))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 600,
        background: '#0f172a',
        color: '#ffffff',
        borderRadius: 14,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        fontSize: 14,
        fontFamily: 'var(--font-sans)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontWeight: 500 }}>Доступно обновление</span>
      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          background: '#ffffff',
          color: '#0f172a',
          border: 'none',
          borderRadius: 8,
          padding: '6px 14px',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
        }}
      >
        Обновить
      </button>
    </div>
  );
}
