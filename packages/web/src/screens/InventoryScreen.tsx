import { useState } from 'react';
import { NAV_HEIGHT } from '../components/BottomNav.js';

const INVENTORY_ARTWORK_SIZE = 104;

type InventoryArtworkType = 'sticks' | 'skates' | 'nutrition';

const INVENTORY_ARTWORK_IMAGES: Record<InventoryArtworkType, string> = {
  sticks: '/inventory/sticks.webp',
  skates: '/inventory/skates.webp',
  nutrition: '/inventory/nutrition.webp',
};

const INVENTORY_SLOTS = [
  {
    title: 'Клюшки',
    description: 'Более точные и быстрые броски по воротам',
    artwork: 'sticks',
  },
  {
    title: 'Коньки',
    description: 'Управление скоростью перемещения игрока',
    artwork: 'skates',
  },
  {
    title: 'Спортпитание',
    description: 'Ускоренное восстановление и меньшая усталость',
    artwork: 'nutrition',
  },
] as const;

export function InventoryScreen(): JSX.Element {
  const [lockedInfoOpen, setLockedInfoOpen] = useState(false);

  return (
    <main
      className="screen"
      style={{
        padding: `calc(16px + var(--app-safe-top)) 14px calc(${NAV_HEIGHT + 24}px + var(--app-safe-bottom))`,
        gap: 14,
      }}
    >
      <section aria-label="Валюта" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="section-label" style={{ margin: '0 0 6px -14px' }}>
          Валюта
        </div>
        <div
          className="glass"
          style={{
            borderRadius: 22,
            padding: '18px 20px',
            color: 'var(--ink)',
            fontSize: 18,
            fontWeight: 900,
          }}
        >
          У вас пока нет накопленных денег
        </div>
      </section>

      <section aria-label="Инвентарь" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="section-label" style={{ margin: '0 0 6px -14px' }}>
          Инвентарь
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {INVENTORY_SLOTS.map((slot) => {
            return (
              <button
                key={slot.title}
                type="button"
                aria-label={`${slot.title}: ${slot.description}. Недоступно`}
                onClick={() => setLockedInfoOpen(true)}
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  borderRadius: 22,
                  padding: 12,
                  display: 'grid',
                  gridTemplateColumns: `${INVENTORY_ARTWORK_SIZE}px minmax(0, 1fr)`,
                  gap: 12,
                  alignItems: 'center',
                  background: 'rgba(255, 255, 255, 0.34)',
                  border: '1px solid rgba(255,255,255,0.66)',
                  boxShadow: '0 8px 22px rgba(15,23,42,0.1), inset 0 1px 0 rgba(255,255,255,0.78)',
                  width: '100%',
                  textAlign: 'left',
                  color: 'inherit',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  cursor: 'pointer',
                }}
              >
                <InventoryArtwork label={slot.title} artwork={slot.artwork} />
                <div
                  style={{
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <h2
                    style={{
                      margin: 0,
                      minWidth: 0,
                      fontSize: 18,
                      lineHeight: 1.05,
                      fontWeight: 900,
                      color: 'rgba(15,23,42,0.62)',
                    }}
                  >
                    {slot.title}
                  </h2>
                  <div
                    style={{
                      color: 'rgba(15,23,42,0.48)',
                      fontSize: 12,
                      fontWeight: 700,
                      lineHeight: 1.25,
                    }}
                  >
                    {slot.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {lockedInfoOpen && <InventoryLockedModal onClose={() => setLockedInfoOpen(false)} />}
    </main>
  );
}

function InventoryLockedModal({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Недоступно"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.35)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 250,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        className="glass"
        onClick={(event) => event.stopPropagation()}
        style={{ borderRadius: 24, padding: '22px 22px 18px', maxWidth: 320, width: '100%' }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>
          Недоступно
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
          Инвентарь будет открыт при переходе в режим любителей
        </div>
        <button
          type="button"
          className="btn btn--cta"
          onClick={onClose}
          style={{ marginTop: 18, width: '100%', padding: '12px 0', fontSize: 14 }}
        >
          Понятно
        </button>
      </div>
    </div>
  );
}

function InventoryArtwork({
  label,
  artwork,
}: {
  label: string;
  artwork: InventoryArtworkType;
}): JSX.Element {
  const imageSrc = INVENTORY_ARTWORK_IMAGES[artwork];

  return (
    <div
      aria-label={`Изображение инвентаря ${label}`}
      style={{
        position: 'relative',
        width: INVENTORY_ARTWORK_SIZE,
        height: INVENTORY_ARTWORK_SIZE,
        aspectRatio: '1 / 1',
        alignSelf: 'center',
        justifySelf: 'center',
        borderRadius: 22,
        overflow: 'hidden',
        background: 'linear-gradient(145deg, #dbeafe 0%, #f8fafc 48%, #bfdbfe 100%)',
        border: '1px solid rgba(255,255,255,0.82)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 8px 18px rgba(15,23,42,0.12)',
        opacity: 0.66,
      }}
    >
      <img
        src={imageSrc}
        alt=""
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
    </div>
  );
}
