import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleDollarSign, Star, Trophy, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  fetchMyInventory,
  purchaseInventoryItem,
  type InventoryEquipmentKind,
  type InventoryItem,
  type InventoryPurchase,
  type InventoryState,
} from '../api/inventory.js';
import { artworkForInventoryItem } from './inventoryArtwork.js';

const INVENTORY_KINDS: InventoryEquipmentKind[] = ['stick', 'skates', 'nutrition'];

const KIND_META: Record<InventoryEquipmentKind, { title: string }> = {
  stick: { title: 'Клюшки' },
  skates: { title: 'Коньки' },
  nutrition: { title: 'Питание' },
};

function numberText(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

function periodWord(value: number): string {
  const abs = Math.abs(value);
  const lastTwo = abs % 100;
  const last = abs % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return 'периодов';
  if (last === 1) return 'период';
  if (last >= 2 && last <= 4) return 'периода';
  return 'периодов';
}

function purchaseBundleLabel(item: InventoryItem): string {
  const count = item.chargesPerPurchase || item.chargesAvailable || 5;
  return `${numberText(count)} ${periodWord(count)}`;
}

function formatPurchaseDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function InventoryScreen(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [detailsItem, setDetailsItem] = useState<InventoryItem | null>(null);
  const [purchaseItem, setPurchaseItem] = useState<InventoryItem | null>(null);
  const inventoryQuery = useQuery<InventoryState>({
    queryKey: ['inventory', 'me'],
    queryFn: fetchMyInventory,
  });
  const purchaseMutation = useMutation<InventoryState, Error, InventoryItem>({
    mutationFn: (item) => purchaseInventoryItem(item.id),
    onSuccess: (inventory) => {
      queryClient.setQueryData(['inventory', 'me'], inventory);
      setPurchaseItem(null);
    },
  });

  const inventory = inventoryQuery.data;
  const allItems = INVENTORY_KINDS.flatMap((kind) => inventory?.items[kind] ?? []);
  const hasAnyItems = allItems.length > 0;
  const tokens = inventory?.balances.tokens ?? 0;
  const history = inventory?.purchaseHistory ?? [];

  const openPurchase = (item: InventoryItem): void => {
    purchaseMutation.reset();
    setDetailsItem(null);
    setPurchaseItem(item);
  };

  return (
    <main
      className="screen"
      style={{
        padding: 'calc(22px + var(--app-safe-top)) 24px 24px',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 760,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="icon-btn"
            onClick={() => navigate('/sections')}
            aria-label="Назад"
            title="Назад"
            style={{
              width: 40,
              height: 40,
              minWidth: 40,
              minHeight: 40,
              borderRadius: 999,
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <h1 style={{ margin: 0, minWidth: 0, fontSize: 24, fontWeight: 800 }}>Магазин</h1>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          <BalanceCard
            label="Монеты"
            value={tokens}
            icon={<CircleDollarSign size={16} strokeWidth={2.45} />}
            iconColor="#C48A1D"
          />
          <BalanceCard
            label="Звёзды"
            value={inventory?.balances.stars ?? 0}
            icon={<Star size={16} strokeWidth={2.45} fill="currentColor" />}
            iconColor="#D9A21B"
          />
          <BalanceCard
            label="Опыт"
            value={inventory?.balances.experience ?? 0}
            icon={<Trophy size={16} strokeWidth={2.45} />}
            iconColor="#21A19A"
          />
        </div>

        {inventoryQuery.isLoading ? (
          <div className="glass" style={{ borderRadius: 22, padding: 16, color: 'var(--muted)' }}>
            Загрузка...
          </div>
        ) : !hasAnyItems ? (
          <InventoryEmptyState />
        ) : (
          <>
            <div style={{ display: 'grid', gap: 18 }}>
              {INVENTORY_KINDS.map((kind) => {
                const items = inventory?.items[kind] ?? [];
                if (items.length === 0) return null;
                return (
                  <section key={kind} aria-label={KIND_META[kind].title}>
                    <div className="section-label" style={{ margin: '0 0 8px -14px' }}>
                      {KIND_META[kind].title}
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                        gap: 8,
                      }}
                    >
                      {items.map((item) => {
                        const canBuy = tokens >= item.currencyPrice;
                        return (
                          <InventoryProductCard
                            key={item.id}
                            item={item}
                            canBuy={canBuy}
                            isBuying={purchaseMutation.isPending && purchaseMutation.variables?.id === item.id}
                            onDetails={() => setDetailsItem(item)}
                            onBuy={() => openPurchase(item)}
                          />
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
            <PurchaseHistorySection history={history} />
          </>
        )}
      </section>

      {detailsItem !== null && (
        <InventoryItemModal
          item={detailsItem}
          canBuy={tokens >= detailsItem.currencyPrice}
          isBuying={purchaseMutation.isPending && purchaseMutation.variables?.id === detailsItem.id}
          error={purchaseMutation.isError ? purchaseMutation.error.message : null}
          onClose={() => {
            purchaseMutation.reset();
            setDetailsItem(null);
          }}
          onBuy={() => openPurchase(detailsItem)}
        />
      )}

      {purchaseItem !== null && (
        <PurchaseConfirmModal
          item={purchaseItem}
          isSaving={purchaseMutation.isPending}
          error={purchaseMutation.isError ? purchaseMutation.error.message : null}
          onClose={() => {
            purchaseMutation.reset();
            setPurchaseItem(null);
          }}
          onConfirm={() => purchaseMutation.mutate(purchaseItem)}
        />
      )}
    </main>
  );
}

function BalanceCard({
  label,
  value,
  icon,
  iconColor,
}: {
  label: string;
  value: number;
  icon: JSX.Element;
  iconColor: string;
}): JSX.Element {
  return (
    <div
      className="glass"
      aria-label={`${label}: ${numberText(value)}`}
      style={{
        minWidth: 0,
        minHeight: 74,
        borderRadius: 18,
        padding: '12px 11px',
        position: 'relative',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        gap: 8,
        overflow: 'hidden',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 10,
          right: 12,
          width: 18,
          height: 18,
          color: iconColor,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </span>
      <span
        style={{
          minWidth: 0,
          maxWidth: 'calc(100% - 30px)',
          color: 'var(--muted)',
          fontSize: 10,
          fontWeight: 700,
          lineHeight: 1.05,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </span>
      <span
        style={{
          alignSelf: 'end',
          color: 'var(--ink)',
          fontSize: 22,
          fontWeight: 800,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {numberText(value)}
      </span>
    </div>
  );
}

function InventoryProductCard({
  item,
  canBuy,
  isBuying,
  onDetails,
  onBuy,
}: {
  item: InventoryItem;
  canBuy: boolean;
  isBuying: boolean;
  onDetails: () => void;
  onBuy: () => void;
}): JSX.Element {
  return (
    <article
      className="glass"
      style={{
        minWidth: 0,
        minHeight: 194,
        padding: 10,
        borderRadius: 22,
        display: 'grid',
        gridTemplateRows: '96px minmax(0, 1fr) auto',
        gap: 8,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onDetails}
        aria-label={`Подробнее о ${item.title}`}
        style={{
          minWidth: 0,
          height: 96,
          border: '1px solid rgba(255,255,255,0.78)',
          borderRadius: 18,
          padding: 0,
          overflow: 'hidden',
          background: 'rgba(255,255,255,0.3)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.78), 0 8px 14px rgba(15,23,42,0.08)',
          cursor: 'pointer',
        }}
      >
        <img
          src={artworkForInventoryItem(item)}
          alt=""
          style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
        />
      </button>
      <button
        type="button"
        onClick={onDetails}
        aria-label={`Открыть ${item.title}`}
        style={{
          minWidth: 0,
          border: 0,
          padding: 0,
          background: 'transparent',
          color: 'inherit',
          display: 'grid',
          gap: 5,
          alignContent: 'start',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <h2
          style={{
            margin: 0,
            minWidth: 0,
            color: 'var(--ink)',
            fontSize: 13,
            fontWeight: 950,
            lineHeight: 1.1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {item.title}
        </h2>
        <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800, lineHeight: 1.2 }}>
          {purchaseBundleLabel(item)}
        </div>
        <div style={{ color: 'var(--ink)', fontSize: 13, fontWeight: 950, lineHeight: 1.1 }}>
          {numberText(item.currencyPrice)} монет
        </div>
      </button>
      <button
        type="button"
        className="btn btn--cta"
        disabled={!canBuy || isBuying}
        onClick={onBuy}
        aria-label={
          canBuy
            ? `Купить ${item.title} за ${numberText(item.currencyPrice)} монет`
            : `Не хватает монет на ${item.title}`
        }
        style={{
          minWidth: 0,
          width: '100%',
          minHeight: 34,
          padding: '0 10px',
          fontSize: 12,
          opacity: !canBuy ? 0.5 : undefined,
          cursor: !canBuy ? 'not-allowed' : undefined,
        }}
      >
        {isBuying ? 'Покупка...' : canBuy ? 'Купить' : 'Не хватает'}
      </button>
    </article>
  );
}

function InventoryEmptyState(): JSX.Element {
  return (
    <section
      aria-label="Пустой магазин"
      className="glass"
      style={{
        borderRadius: 26,
        padding: '22px 18px',
        minHeight: 180,
        display: 'grid',
        alignContent: 'center',
        justifyItems: 'center',
        gap: 8,
        textAlign: 'center',
      }}
    >
      <h2 style={{ margin: 0, color: 'var(--ink)', fontSize: 18, fontWeight: 950 }}>
        Товары скоро появятся
      </h2>
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13, fontWeight: 750, lineHeight: 1.4 }}>
        Здесь будут клюшки, коньки и питание за монеты.
      </p>
    </section>
  );
}

function InventoryItemModal({
  item,
  canBuy,
  isBuying,
  error,
  onClose,
  onBuy,
}: {
  item: InventoryItem;
  canBuy: boolean;
  isBuying: boolean;
  error: string | null;
  onClose: () => void;
  onBuy: () => void;
}): JSX.Element {
  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 420 }}>
      <section
        role="dialog"
        aria-label={item.title}
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(430px, calc(100vw - 28px))', display: 'grid', gap: 14 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="modal-title">{item.title}</div>
          </div>
          <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <div
          style={{
            height: 154,
            borderRadius: 22,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.78)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.78), 0 10px 18px rgba(15,23,42,0.1)',
          }}
        >
          <img
            src={artworkForInventoryItem(item)}
            alt=""
            style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
          />
        </div>

        <div className="glass" style={{ borderRadius: 18, padding: 14, display: 'grid', gap: 9 }}>
          <DetailRow label="Цена" value={`${numberText(item.currencyPrice)} монет`} />
        </div>

        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13, fontWeight: 750, lineHeight: 1.4 }}>
          {item.description}
        </p>

        {error !== null && (
          <div role="alert" style={{ color: 'var(--red-deep)', fontSize: 13, fontWeight: 800 }}>
            {error}
          </div>
        )}

        <button
          type="button"
          className="modal-primary btn--cta"
          disabled={!canBuy || isBuying}
          onClick={onBuy}
        >
          {isBuying ? 'Покупка...' : canBuy ? 'Купить' : 'Не хватает монет'}
        </button>
      </section>
    </div>
  );
}

function PurchaseConfirmModal({
  item,
  isSaving,
  error,
  onClose,
  onConfirm,
}: {
  item: InventoryItem;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}): JSX.Element {
  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 430 }}>
      <section
        role="dialog"
        aria-label={`Купить ${item.title}?`}
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(390px, calc(100vw - 28px))', display: 'grid', gap: 14 }}
      >
        <div className="modal-title">Купить {item.title}?</div>
        <p className="modal-copy" style={{ margin: 0 }}>
          Будет списано {numberText(item.currencyPrice)} монет. В инвентарь добавится{' '}
          {purchaseBundleLabel(item)}.
        </p>
        {error !== null && (
          <div role="alert" style={{ color: 'var(--red-deep)', fontSize: 13, fontWeight: 800 }}>
            {error}
          </div>
        )}
        <div className="modal-actions" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={isSaving}>
            Отмена
          </button>
          <button type="button" className="modal-primary btn--cta" onClick={onConfirm} disabled={isSaving}>
            {isSaving ? 'Покупка...' : 'Купить'}
          </button>
        </div>
      </section>
    </div>
  );
}

function PurchaseHistorySection({ history }: { history: InventoryPurchase[] }): JSX.Element {
  return (
    <section aria-label="История покупок" style={{ display: 'grid', gap: 8 }}>
      <div className="section-label" style={{ margin: '0 0 0 -14px' }}>
        История покупок
      </div>
      <div className="glass" style={{ borderRadius: 22, padding: 14, display: 'grid', gap: 10 }}>
        {history.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 750 }}>
            Покупок пока нет.
          </div>
        ) : (
          history.map((purchase) => (
            <div
              key={purchase.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gap: 10,
                alignItems: 'center',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    color: 'var(--ink)',
                    fontSize: 13,
                    fontWeight: 900,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {purchase.title}
                </div>
                <div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 11, fontWeight: 750 }}>
                  {formatPurchaseDate(purchase.createdAt)} · {numberText(purchase.chargesAdded)}{' '}
                  {periodWord(purchase.chargesAdded)}
                </div>
              </div>
              <div style={{ color: 'var(--ink)', fontSize: 12, fontWeight: 950 }}>
                -{numberText(purchase.tokensSpent)}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 800 }}>{label}</span>
      <span style={{ color: 'var(--ink)', fontSize: 12, fontWeight: 900, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}
