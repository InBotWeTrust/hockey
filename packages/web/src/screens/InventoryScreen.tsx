import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Coins, Star } from 'lucide-react';
import { apiFetch } from '../api/apiFetch.js';

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
    title: 'Энергия',
    description: 'Ускоренное восстановление и меньшая усталость',
    artwork: 'nutrition',
  },
] as const;

interface InventoryProfile {
  currencyBalance?: number;
  starBalance?: number;
}

function formatCountLabel(balance: number, forms: [string, string, string]): string {
  const normalized = Math.max(0, Math.trunc(balance));
  const mod10 = normalized % 10;
  const mod100 = normalized % 100;
  const noun =
    mod10 === 1 && mod100 !== 11
      ? forms[0]
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? forms[1]
        : forms[2];
  return `${normalized} ${noun}`;
}

function formatTokenBalance(balance: number): string {
  return formatCountLabel(balance, ['токен', 'токена', 'токенов']);
}

function formatStarBalance(balance: number): string {
  return formatCountLabel(balance, ['звезда', 'звезды', 'звёзд']);
}

function normalizeBalance(balance: number | undefined): number {
  return Math.max(0, Math.trunc(balance ?? 0));
}

export function InventoryScreen(): JSX.Element {
  const [lockedInfoOpen, setLockedInfoOpen] = useState(false);
  const { data } = useQuery<InventoryProfile>({
    queryKey: ['inventory', 'profile-balance'],
    queryFn: () => apiFetch<InventoryProfile>('/me'),
  });
  const tokenAmount = normalizeBalance(data?.currencyBalance);
  const starAmount = normalizeBalance(data?.starBalance);
  const tokenBalance = formatTokenBalance(tokenAmount);
  const starBalance = formatStarBalance(starAmount);

  return (
    <main
      className="screen"
      style={{
        padding: 'calc(16px + var(--app-safe-top)) 14px 24px',
        gap: 14,
      }}
    >
      <section aria-label="Валюта" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="section-label" style={{ margin: '0 0 6px -14px' }}>
          Валюта
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <CurrencyBalanceCard
            ariaLabel={`Токены: ${tokenBalance}`}
            amount={tokenAmount}
            icon="tokens"
          />
          <CurrencyBalanceCard
            ariaLabel={`Звёзды: ${starBalance}`}
            amount={starAmount}
            icon="stars"
          />
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
                  background: 'rgba(255, 255, 255, 0.18)',
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
                      color: 'var(--ink)',
                    }}
                  >
                    {slot.title}
                  </h2>
                  <div
                    style={{
                      color: 'rgba(15, 23, 42, 0.64)',
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

function CurrencyBalanceCard({
  ariaLabel,
  amount,
  icon,
}: {
  ariaLabel: string;
  amount: number;
  icon: 'tokens' | 'stars';
}): JSX.Element {
  const isTokens = icon === 'tokens';
  return (
    <div
      className="glass"
      aria-label={ariaLabel}
      style={{
        minWidth: 0,
        borderRadius: 22,
        padding: '16px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        color: 'var(--ink)',
      }}
    >
      <span
        style={{
          minWidth: 0,
          fontSize: 28,
          lineHeight: 1,
          fontWeight: 950,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {amount}
      </span>
      <span
        aria-hidden="true"
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: isTokens ? '#92400e' : '#713f12',
          background: isTokens
            ? 'radial-gradient(circle at 34% 24%, #fff7ad 0%, #facc15 45%, #f59e0b 100%)'
            : 'radial-gradient(circle at 34% 24%, #fff7ad 0%, #fde047 42%, #f59e0b 100%)',
          border: '1px solid rgba(146, 64, 14, 0.28)',
          boxShadow:
            '0 12px 22px rgba(180, 83, 9, 0.24), inset 0 1px 0 rgba(255,255,255,0.72)',
        }}
      >
        {isTokens ? <Coins size={23} strokeWidth={2.4} /> : <Star size={23} strokeWidth={2.5} />}
      </span>
    </div>
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
          Инвентарь пока недоступен. Откроем его в следующих обновлениях.
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
        opacity: 1,
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
          filter: 'grayscale(1) saturate(0.1)',
          opacity: 0.58,
        }}
      />
    </div>
  );
}
