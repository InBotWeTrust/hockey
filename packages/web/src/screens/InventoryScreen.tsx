import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { triggerHaptic } from '../feedback/haptics.js';
import type { UseMutationResult } from '@tanstack/react-query';
import { ArrowLeft, CircleDollarSign, RussianRuble, Sparkles, Star, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { rewardColor, type RewardTone } from '../app/rewardColors.js';
import { SegmentedTabs } from '../components/SegmentedTabs.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import {
  fetchMyInventory,
  purchaseInventoryItem,
  type BankPurchase,
  type InventoryEquipmentKind,
  type InventoryItem,
  type InventoryPurchase,
  type InventoryState,
  type InventoryTransaction,
  type InventoryTransactionAmount,
  type InventoryTransactionCurrency,
} from '../api/inventory.js';
import { artworkForInventoryItem } from './inventoryArtwork.js';
import { formatInventoryResourceAmount } from './inventoryResourceLabels.js';

type ShopTab = 'goods' | 'bank' | 'history';
type HistoryFilter = 'all' | 'credit' | 'debit' | 'ruble';

const INVENTORY_KINDS: InventoryEquipmentKind[] = ['stick', 'skates', 'nutrition'];
const SHOP_TABS: Array<{ id: ShopTab; label: string }> = [
  { id: 'goods', label: 'Товары' },
  { id: 'bank', label: 'Банк' },
  { id: 'history', label: 'История' },
];
const HISTORY_FILTERS: Array<{ id: HistoryFilter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'credit', label: 'Начисления' },
  { id: 'debit', label: 'Списания' },
  { id: 'ruble', label: 'Рубли' },
];

const BANK_PACKAGES = [
  {
    id: 'starter',
    title: 'Стартовый набор',
    tokens: 500,
    priceRub: 149,
    note: 'Для первых покупок',
  },
  {
    id: 'player',
    title: 'Игровой запас',
    tokens: 1200,
    priceRub: 299,
    note: 'Оптимальный пакет',
  },
  {
    id: 'club',
    title: 'Клубный банк',
    tokens: 3000,
    priceRub: 699,
    note: 'Максимум монет',
  },
] as const;

const KIND_META: Record<InventoryEquipmentKind, { title: string }> = {
  stick: { title: 'Клюшки' },
  skates: { title: 'Коньки' },
  nutrition: { title: 'Питание' },
};

function numberText(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

function rubText(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value);
}

function purchaseBundleLabel(item: InventoryItem): string {
  const count = item.chargesPerPurchase || item.chargesAvailable || 5;
  return formatInventoryResourceAmount(item.kind, count, item.resourceUnit);
}

function addedInventoryTitle(item: InventoryItem): string {
  if (item.kind === 'skates') return `${item.title} добавлены`;
  if (item.kind === 'nutrition') return `${item.title} добавлено`;
  return `${item.title} добавлена`;
}

function uniqueShopItems(items: InventoryItem[]): InventoryItem[] {
  const seen = new Set<string>();
  const result: InventoryItem[] = [];
  for (const item of items) {
    const key = `${item.kind}:${item.rarity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
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

function bankStatusText(status: BankPurchase['status']): string {
  if (status === 'paid') return 'Оплачено';
  if (status === 'pending') return 'Ожидает оплаты';
  if (status === 'failed') return 'Ошибка оплаты';
  if (status === 'refunded') return 'Возврат';
  return 'Отменено';
}

function transactionFlowFromAmounts(
  amounts: InventoryTransactionAmount[],
): InventoryTransaction['flow'] {
  if (amounts.some((amount) => amount.value > 0)) return 'credit';
  if (amounts.some((amount) => amount.value < 0)) return 'debit';
  return 'neutral';
}

function legacyTransactionHistory(
  inventoryHistory: InventoryPurchase[],
  bankHistory: BankPurchase[],
): InventoryTransaction[] {
  return [
    ...inventoryHistory.map((purchase) => ({
      id: `inventory-${purchase.id}`,
      createdAt: purchase.createdAt,
      title: purchase.title,
      subtitle: `${formatPurchaseDate(purchase.createdAt)} · товар · ${formatInventoryResourceAmount(purchase.kind, purchase.chargesAdded)}`,
      category: 'inventory' as const,
      flow: 'debit' as const,
      amounts: [{ currency: 'coin' as const, value: -Math.abs(purchase.tokensSpent) }],
    })),
    ...bankHistory.map((purchase) => {
      const value =
        purchase.status === 'refunded'
          ? purchase.amountRub
          : purchase.status === 'paid'
            ? -purchase.amountRub
            : purchase.amountRub;
      const amounts = [{ currency: 'ruble' as const, value }];
      return {
        id: `bank-${purchase.id}`,
        createdAt: purchase.createdAt,
        title: purchase.title,
        subtitle: `${formatPurchaseDate(purchase.createdAt)} · банк · ${bankStatusText(purchase.status)}`,
        category: 'bank' as const,
        flow: transactionFlowFromAmounts(amounts),
        amounts,
      };
    }),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function InventoryScreen(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ShopTab>('goods');
  const [detailsItem, setDetailsItem] = useState<InventoryItem | null>(null);
  const [purchaseItem, setPurchaseItem] = useState<InventoryItem | null>(null);
  const [purchaseNotice, setPurchaseNotice] = useState<{
    title: string;
    amount: string;
  } | null>(null);
  const inventoryQuery = useQuery<InventoryState>({
    queryKey: ['inventory', 'me'],
    queryFn: fetchMyInventory,
  });
  const purchaseMutation = useMutation<InventoryState, Error, InventoryItem>({
    mutationFn: (item) => purchaseInventoryItem(item.itemId ?? item.id),
    onSuccess: (inventory, item) => {
      triggerHaptic('success');
      queryClient.setQueryData(['inventory', 'me'], inventory);
      setPurchaseItem(null);
      setPurchaseNotice({
        title: addedInventoryTitle(item),
        amount: `+${purchaseBundleLabel(item)} в инвентарь`,
      });
      window.setTimeout(() => setPurchaseNotice(null), 2800);
    },
    onError: () => triggerHaptic('error'),
  });

  const inventory = inventoryQuery.data;
  const allItems = INVENTORY_KINDS.flatMap((kind) => inventory?.items[kind] ?? []);
  const hasAnyItems = allItems.length > 0;
  const tokens = inventory?.balances.tokens ?? 0;
  const history = inventory?.purchaseHistory ?? [];
  const bankHistory = inventory?.bankHistory ?? [];
  const transactionHistory =
    inventory?.transactionHistory ?? legacyTransactionHistory(history, bankHistory);

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
        <div
          className="inventory-shop-header"
          style={{
            display: 'grid',
            gridTemplateColumns: '40px minmax(0, 1fr) auto',
            gap: 10,
            alignItems: 'center',
          }}
        >
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
          <h1
            className="screen-title-on-arena"
            style={{ margin: 0, minWidth: 0, fontSize: 24, fontWeight: 800 }}
          >
            Магазин
          </h1>
          <ShopBalanceBar tokens={tokens} stars={inventory?.balances.stars ?? 0} />
        </div>

        <ShopTabs activeTab={activeTab} onChange={setActiveTab} />

        {inventoryQuery.isLoading ? (
          <div className="glass" style={{ borderRadius: 22, padding: 16, color: 'var(--muted)' }}>
            Загрузка...
          </div>
        ) : activeTab === 'goods' && !hasAnyItems ? (
          <InventoryEmptyState />
        ) : activeTab === 'goods' ? (
          <GoodsTab
            inventory={inventory}
            tokens={tokens}
            purchaseMutation={purchaseMutation}
            onDetails={setDetailsItem}
            onBuy={openPurchase}
          />
        ) : activeTab === 'bank' ? (
          <BankTab />
        ) : (
          <TransactionHistorySection transactions={transactionHistory} />
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

      {purchaseNotice && (
        <div
          aria-live="polite"
          style={{
            position: 'fixed',
            left: 18,
            right: 18,
            bottom: 'calc(88px + var(--app-safe-bottom))',
            zIndex: 280,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            className="glass"
            style={{
              width: 'min(100%, 330px)',
              borderRadius: 18,
              padding: '14px 16px',
              display: 'grid',
              gridTemplateColumns: '34px minmax(0, 1fr)',
              gap: 10,
              alignItems: 'center',
              animation: 'reward-pop 2.6s ease both',
            }}
          >
            <Sparkles size={24} color="#0f766e" />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 950, color: 'var(--ink)' }}>
                {purchaseNotice.title}
              </div>
              <div
                style={{
                  marginTop: 3,
                  color: '#0f766e',
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                {purchaseNotice.amount}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function GoodsTab({
  inventory,
  tokens,
  purchaseMutation,
  onDetails,
  onBuy,
}: {
  inventory: InventoryState | undefined;
  tokens: number;
  purchaseMutation: UseMutationResult<InventoryState, Error, InventoryItem>;
  onDetails: (item: InventoryItem) => void;
  onBuy: (item: InventoryItem) => void;
}): JSX.Element {
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {INVENTORY_KINDS.map((kind) => {
        const items = uniqueShopItems(inventory?.items[kind] ?? []);
        if (items.length === 0) return null;
        return (
          <section key={kind} aria-label={KIND_META[kind].title}>
            <div className="section-label" style={{ margin: '0 0 8px -14px' }}>
              {KIND_META[kind].title}
            </div>
            <div style={{ display: 'grid', gap: 18 }}>
              <div className="inventory-shop-grid">
                {items.map((item) => {
                  const canBuy = tokens >= item.currencyPrice;
                  return (
                    <InventoryProductCard
                      key={item.id}
                      item={item}
                      canBuy={canBuy}
                      isBuying={
                        purchaseMutation.isPending && purchaseMutation.variables?.id === item.id
                      }
                      onDetails={() => onDetails(item)}
                      onBuy={() => onBuy(item)}
                    />
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ShopTabs({
  activeTab,
  onChange,
}: {
  activeTab: ShopTab;
  onChange: (tab: ShopTab) => void;
}): JSX.Element {
  return (
    <SegmentedTabs
      items={SHOP_TABS}
      activeTab={activeTab}
      ariaLabel="Разделы магазина"
      onChange={onChange}
    />
  );
}

function BankTab(): JSX.Element {
  return (
    <section aria-label="Банк" style={{ display: 'grid', gap: 8 }}>
      <div className="section-label" style={{ margin: '0 0 0 -14px' }}>
        Банк
      </div>
      <div className="inventory-bank-grid">
        {BANK_PACKAGES.map((pack) => (
          <BankPackageCard key={pack.id} pack={pack} />
        ))}
      </div>
    </section>
  );
}

function BankPackageCard({ pack }: { pack: (typeof BANK_PACKAGES)[number] }): JSX.Element {
  return (
    <article
      className="glass inventory-bank-card"
      style={{
        minWidth: 0,
        minHeight: 178,
        padding: 12,
        borderRadius: 22,
        display: 'grid',
        gridTemplateRows: '1fr auto',
        gap: 10,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'grid', alignContent: 'start', gap: 8, minWidth: 0 }}>
        <div
          aria-hidden="true"
          style={{
            width: 42,
            height: 42,
            borderRadius: 16,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: rewardColor('coin'),
            background: 'rgba(255,255,255,0.52)',
            border: '1px solid rgba(255,255,255,0.72)',
          }}
        >
          <CircleDollarSign size={22} strokeWidth={2.35} />
        </div>
        <h2
          style={{
            margin: 0,
            color: 'var(--ink)',
            fontSize: 13,
            fontWeight: 950,
            lineHeight: 1.1,
          }}
        >
          {pack.title}
        </h2>
        <div style={{ color: rewardColor('coin'), fontSize: 19, fontWeight: 950, lineHeight: 1 }}>
          {numberText(pack.tokens)}
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800, lineHeight: 1.2 }}>
          {pack.note}
        </div>
        <div style={{ color: 'var(--ink)', fontSize: 13, fontWeight: 950, lineHeight: 1.1 }}>
          {rubText(pack.priceRub)}
        </div>
      </div>
      <button
        type="button"
        className="btn btn--cta"
        disabled
        aria-label={`Купить ${numberText(pack.tokens)} монет за ${rubText(pack.priceRub)}`}
        style={{
          minWidth: 0,
          width: '100%',
          minHeight: 34,
          padding: '0 10px',
          fontSize: 12,
          opacity: 0.5,
          cursor: 'not-allowed',
        }}
      >
        Скоро
      </button>
    </article>
  );
}

function ShopBalanceBar({ tokens, stars }: { tokens: number; stars: number }): JSX.Element {
  return (
    <div
      className="glass inventory-shop-balance"
      style={{
        width: 'fit-content',
        maxWidth: '100%',
        borderRadius: 999,
        padding: '9px 12px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 14,
        justifySelf: 'end',
      }}
    >
      <BalanceChip
        label="Монеты"
        value={tokens}
        icon={<CircleDollarSign size={15} strokeWidth={2.45} />}
        tone="coin"
      />
      <BalanceChip
        label="Звёзды"
        value={stars}
        icon={<Star size={15} strokeWidth={2.45} fill="currentColor" />}
        tone="star"
      />
    </div>
  );
}

function BalanceChip({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: JSX.Element;
  tone: RewardTone;
}): JSX.Element {
  return (
    <span
      aria-label={`${label}: ${numberText(value)}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        color: rewardColor(tone),
        fontSize: 13,
        fontWeight: 950,
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </span>
      <span>{numberText(value)}</span>
    </span>
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
      className="glass inventory-product-card"
      style={{
        minWidth: 0,
        display: 'grid',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onDetails}
        aria-label={`Подробнее о ${item.title}`}
        style={{
          minWidth: 0,
          border: '1px solid rgba(255,255,255,0.78)',
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
        <div
          style={{
            minHeight: '2.4em',
            color: 'var(--muted)',
            fontWeight: 800,
            lineHeight: 1.2,
          }}
        >
          {purchaseBundleLabel(item)}
        </div>
        <div
          aria-label={`${numberText(item.currencyPrice)} монет`}
          style={{
            color: rewardColor('coin'),
            fontSize: 13,
            fontWeight: 950,
            lineHeight: 1.1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <CircleDollarSign size={14} strokeWidth={2.55} aria-hidden="true" />
          <span>{numberText(item.currencyPrice)}</span>
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
      <p
        style={{ margin: 0, color: 'var(--muted)', fontSize: 13, fontWeight: 750, lineHeight: 1.4 }}
      >
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
    <AccessibleModal
      title={item.title}
      onRequestClose={onClose}
      closeBlocked={isBuying}
      cardClassName="inventory-item-modal-card"
      backdropStyle={{ zIndex: 420 }}
      cardStyle={{
        width: 'min(430px, calc(100vw - 28px))',
        maxHeight: 'calc(100dvh - 48px - var(--app-safe-top) - var(--app-safe-bottom))',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
      headerAction={
        <button
          type="button"
          className="icon-btn"
          aria-label="Закрыть"
          disabled={isBuying}
          onClick={onClose}
        >
          <X size={15} />
        </button>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <div
          style={{
            width: '100%',
            height: 'var(--inventory-item-art-height, auto)',
            aspectRatio: '1 / 1',
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
          <DetailRow label="Цена" value={`${numberText(item.currencyPrice)} монет`} tone="coin" />
          <DetailRow label="Ресурс" value={purchaseBundleLabel(item)} />
        </div>

        <p
          style={{
            margin: 0,
            color: 'var(--muted)',
            fontSize: 13,
            fontWeight: 750,
            lineHeight: 1.4,
          }}
        >
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
      </div>
    </AccessibleModal>
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
    <AccessibleModal
      title={`Купить ${item.title}?`}
      copy={
        <>
          Будет списано {numberText(item.currencyPrice)} монет. В инвентарь добавится{' '}
          {purchaseBundleLabel(item)}.
        </>
      }
      onRequestClose={onClose}
      closeBlocked={isSaving}
      backdropStyle={{ zIndex: 430 }}
      cardStyle={{ width: 'min(390px, calc(100vw - 28px))' }}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        {error !== null && (
          <div role="alert" style={{ color: 'var(--red-deep)', fontSize: 13, fontWeight: 800 }}>
            {error}
          </div>
        )}
        <div className="modal-actions" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={isSaving}>
            Отмена
          </button>
          <button
            type="button"
            className="modal-primary btn--cta"
            onClick={onConfirm}
            disabled={isSaving}
          >
            {isSaving ? 'Покупка...' : 'Купить'}
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
}

function TransactionHistorySection({
  transactions,
}: {
  transactions: InventoryTransaction[];
}): JSX.Element {
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const filteredEntries = transactions.filter((entry) => {
    if (filter === 'credit') return entry.flow === 'credit';
    if (filter === 'debit') return entry.flow === 'debit' && entry.category !== 'bank';
    if (filter === 'ruble') return entry.amounts.some((amount) => amount.currency === 'ruble');
    return true;
  });

  return (
    <section aria-label="История транзакций" style={{ display: 'grid', gap: 8 }}>
      <div className="section-label" style={{ margin: '0 0 0 -14px' }}>
        История
      </div>
      <div
        aria-label="Фильтр истории"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 6,
        }}
      >
        {HISTORY_FILTERS.map((item) => {
          const active = item.id === filter;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(item.id)}
              style={{
                minWidth: 0,
                minHeight: 30,
                borderRadius: 999,
                border: active
                  ? '1px solid rgba(15,23,42,0.32)'
                  : '1px solid rgba(255,255,255,0.7)',
                background: active ? 'rgba(31,42,61,0.92)' : 'rgba(255,255,255,0.46)',
                color: active ? '#fff' : 'var(--ink)',
                fontSize: 10,
                fontWeight: 900,
                lineHeight: 1,
                cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div className="glass" style={{ borderRadius: 22, padding: 14, display: 'grid', gap: 10 }}>
        {filteredEntries.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 750 }}>
            Операций пока нет.
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <div
              key={entry.id}
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
                  {entry.title}
                </div>
                <div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 11, fontWeight: 750 }}>
                  {transactionSubtitleText(entry)}
                </div>
              </div>
              <div
                style={{
                  display: 'grid',
                  justifyItems: 'end',
                  gap: 4,
                }}
              >
                {entry.amounts.map((amount) => (
                  <TransactionAmountBadge key={`${entry.id}-${amount.currency}`} amount={amount} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function transactionSubtitleText(entry: InventoryTransaction): string {
  const parts = entry.subtitle.split(' · ').filter(Boolean);
  if (parts[0] && Date.parse(parts[0])) {
    return [formatPurchaseDate(entry.createdAt), ...parts.slice(1)].join(' · ');
  }
  return entry.subtitle;
}

function transactionAmountColor(amount: InventoryTransactionAmount): string {
  if (amount.value > 0) return '#0f766e';
  if (amount.currency === 'coin') return rewardColor('coin');
  if (amount.currency === 'star') return rewardColor('star');
  if (amount.currency === 'experience') return rewardColor('experience');
  return 'var(--ink)';
}

function transactionAmountIcon(currency: InventoryTransactionCurrency): JSX.Element {
  if (currency === 'coin') return <CircleDollarSign size={13} strokeWidth={2.55} />;
  if (currency === 'star') return <Star size={13} strokeWidth={2.55} fill="currentColor" />;
  if (currency === 'experience') return <Sparkles size={13} strokeWidth={2.35} />;
  return <RussianRuble size={13} strokeWidth={2.55} />;
}

function transactionAmountLabel(amount: InventoryTransactionAmount): string {
  const action = amount.value > 0 ? 'Начисление' : amount.value < 0 ? 'Списание' : 'Операция';
  const abs = Math.abs(amount.value);
  if (amount.currency === 'coin') return `${action} монет: ${numberText(abs)}`;
  if (amount.currency === 'star') return `${action} звёзд: ${numberText(abs)}`;
  if (amount.currency === 'experience') return `${action} опыта: ${numberText(abs)}`;
  return `${action} рублей: ${numberText(abs)} ₽`;
}

function transactionAmountText(amount: InventoryTransactionAmount): string {
  const prefix = amount.value > 0 ? '+' : amount.value < 0 ? '-' : '';
  const abs = Math.abs(amount.value);
  if (amount.currency === 'ruble') return `${prefix}${numberText(abs)} ₽`;
  return `${prefix}${numberText(abs)}`;
}

function TransactionAmountBadge({ amount }: { amount: InventoryTransactionAmount }): JSX.Element {
  const color = transactionAmountColor(amount);
  return (
    <span
      aria-label={transactionAmountLabel(amount)}
      style={{
        minHeight: 18,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4,
        color,
        fontSize: 12,
        fontWeight: 950,
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true" style={{ display: 'inline-flex', color }}>
        {transactionAmountIcon(amount.currency)}
      </span>
      <span>{transactionAmountText(amount)}</span>
    </span>
  );
}

function DetailRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: RewardTone;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 800 }}>{label}</span>
      <span
        style={{
          color: tone ? rewardColor(tone) : 'var(--ink)',
          fontSize: 12,
          fontWeight: 900,
          textAlign: 'right',
        }}
      >
        {value}
      </span>
    </div>
  );
}
