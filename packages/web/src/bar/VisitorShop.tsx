import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { VisitorProduct, VisitorState } from '@hockey/game-core';
import { useAuthStore } from '../auth/authStore.js';
import { apiFetch, ApiError } from '../api/apiFetch.js';
import { fetchMyInventory } from '../api/inventory.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { ShopProductCard } from '../shop/ShopProductCard.js';
import { ShopPurchaseModal } from '../shop/ShopPurchaseModal.js';
import { useVisitor, visitorChanged, visitorTime } from './visitorApi.js';
import { visitorProductArtwork, visitorProductTitle } from './visitorArtwork.js';
import { formatRussianCount } from '../lib/russianPlural.js';
import './visitor-card.css';

type Purchase = {
  id: string;
  productId: string;
  currency: 'coins' | 'stars';
  expectedPrice: number;
  expectedRevision: number;
};
function readPending(key: string): Purchase | null {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? 'null') as Purchase | null;
  } catch {
    return null;
  }
}
export function VisitorShop({ onClose }: { onClose?: () => void }) {
  const owner = useAuthStore((state) => state.user?.id) ?? 'preview';
  // Remount account-owned purchase state if the signed-in account changes.
  return <VisitorCatalog key={owner} owner={owner} {...(onClose ? { onClose } : {})} />;
}
function VisitorCatalog({ owner, onClose }: { owner: string; onClose?: () => void }) {
  const requestKey = `bar-visitor-purchase:${owner}`;
  const { data, error, refresh } = useVisitor();
  const inventory = useQuery({ queryKey: ['inventory', 'me'], queryFn: fetchMyInventory });
  const queryClient = useQueryClient();
  const pending = useRef<Purchase | null>(readPending(requestKey));
  const [selectedId, setSelectedId] = useState<string | null>(pending.current?.productId ?? null);
  const [details, setDetails] = useState<VisitorProduct | null>(null);
  const [notice, setNotice] = useState('');
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const selected = data?.settings.products.find((product) => product.id === selectedId);
  const coins = inventory.data?.balances.tokens ?? 0;
  const stars = inventory.data?.balances.stars ?? 0;
  const select = (product: VisitorProduct) => {
    setDetails(null);
    setPurchaseError(null);
    setSelectedId(pending.current?.productId ?? product.id);
  };
  const buy = async (currency: 'coins' | 'stars') => {
    if (
      !data ||
      !selected ||
      busyRef.current ||
      (pending.current && pending.current.currency !== currency)
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setPurchaseError(null);
    const input = pending.current ?? {
      id: crypto.randomUUID(),
      productId: selected.id,
      currency,
      expectedPrice: selected[currency],
      expectedRevision: data.revision,
    };
    pending.current = input;
    try {
      sessionStorage.setItem(requestKey, JSON.stringify(input));
      await apiFetch<VisitorState>('/bar/visitor/purchases', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      pending.current = null;
      sessionStorage.removeItem(requestKey);
      if (!mounted.current) return;
      setSelectedId(null);
      setNotice('Покупка готова. Можно продолжать!');
      visitorChanged();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        refresh(),
      ]);
    } catch (cause) {
      if (!mounted.current) return;
      setPurchaseError(
        cause instanceof Error ? cause.message : 'Покупка не прошла. Попробуй ещё раз.',
      );
      if (cause instanceof ApiError && cause.status < 500) {
        pending.current = null;
        sessionStorage.removeItem(requestKey);
        await refresh();
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const copy = (product: VisitorProduct) =>
    product.kind === 'messages'
      ? `В запас добавится ${product.amount} сообщений для всех персонажей. Остаток не сгорает.`
      : data?.state.card.active
        ? `Добавим ${data.settings.cardDays} дней к оставшемуся сроку карты.`
        : `Карта начнёт действовать сразу на ${data?.settings.cardDays ?? 30} дней. Экипировать её не нужно.`;
  const content = (
    <section className="inventory-category-catalog" aria-label="Товары бара">
      {error && (
        <p role="alert">
          Не удалось загрузить товары.{' '}
          <button className="btn btn--ghost" onClick={() => void refresh()}>
            Повторить
          </button>
        </p>
      )}
      {!data && !error && <p className="modal-copy">Загружаем товары…</p>}
      {inventory.isError && (
        <p role="alert">
          Не удалось загрузить баланс.{' '}
          <button className="btn btn--ghost" onClick={() => void inventory.refetch()}>
            Повторить
          </button>
        </p>
      )}
      <div
        className="inventory-shop-grid"
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}
      >
        {data?.settings.products.map((product) => (
          <ShopProductCard
            key={product.id}
            title={visitorProductTitle(product)}
            artworkUrl={visitorProductArtwork(product)}
            description={
              product.kind === 'card'
                ? `${data.settings.cardDays} дней`
                : 'Запас без срока действия'
            }
            coinPrice={product.coins}
            starPrice={product.stars}
            canBuy={
              pending.current?.productId === product.id ||
              coins >= product.coins ||
              stars >= product.stars
            }
            coinAffordable={coins >= product.coins}
            isBuying={busy && selectedId === product.id}
            onDetails={() => setDetails(product)}
            onBuy={() => select(product)}
          />
        ))}
      </div>
      {notice && (
        <p role="status" className="modal-copy">
          {notice}
        </p>
      )}
    </section>
  );
  return (
    <>
      {onClose ? (
        <AccessibleModal
          title="Стойка Игоря"
          cardClassName="visitor-shop-modal"
          closeBlocked={busy}
          onRequestClose={() => {
            if (!busyRef.current) onClose();
          }}
          headerAction={
            <button className="icon-btn" aria-label="Закрыть" disabled={busy} onClick={onClose}>
              <X size={18} />
            </button>
          }
        >
          {content}
        </AccessibleModal>
      ) : (
        content
      )}
      {details && (
        <AccessibleModal
          title={visitorProductTitle(details)}
          copy={copy(details)}
          backdropStyle={{ zIndex: 420 }}
          cardStyle={{ width: 'min(390px, calc(100vw - 28px))' }}
          onRequestClose={() => setDetails(null)}
          headerAction={
            <button className="icon-btn" aria-label="Закрыть" onClick={() => setDetails(null)}>
              <X size={15} />
            </button>
          }
        >
          <img
            className="visitor-product-art"
            src={visitorProductArtwork(details)}
            alt={visitorProductTitle(details)}
          />
          {details.kind === 'card' && data && (
            <p className="modal-copy">
              С картой {data.settings.cardMessages} сообщений в день и по{' '}
              {formatRussianCount(data.settings.cardGames, 'игру', 'игры', 'игр')} с каждым персонажем.
              {data.state.card.active && data.state.card.expiresAt
                ? ` Карта действует до ${visitorTime(data.state.card.expiresAt)}.`
                : ''}
            </p>
          )}
          <div className="modal-actions">
            <button className="modal-primary btn--cta" onClick={() => select(details)}>
              Купить
            </button>
          </div>
        </AccessibleModal>
      )}
      {selected && (
        <ShopPurchaseModal
          title={`Купить «${visitorProductTitle(selected)}»?`}
          copy={copy(selected)}
          coinPrice={selected.coins}
          starPrice={selected.stars}
          canBuyCoins={
            pending.current ? pending.current.currency === 'coins' : coins >= selected.coins
          }
          canBuyStars={
            pending.current ? pending.current.currency === 'stars' : stars >= selected.stars
          }
          isSaving={busy}
          error={purchaseError}
          onClose={() => {
            if (!busyRef.current) setSelectedId(null);
          }}
          onConfirm={(currency) => void buy(currency)}
        />
      )}
    </>
  );
}
