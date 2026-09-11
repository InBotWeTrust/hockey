import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { triggerHaptic } from '../feedback/haptics.js';
import type { UseMutationResult } from '@tanstack/react-query';
import {
  ArrowLeft,
  CircleDollarSign,
  Gift,
  Landmark,
  RussianRuble,
  ShoppingBag,
  Sparkles,
  Star,
  TrendingUp,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { rewardColor, type RewardTone } from '../app/rewardColors.js';
import { SegmentedTabs } from '../components/SegmentedTabs.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import {
  fetchMyInventory,
  fetchInventoryTransactions,
  purchaseInventoryItem,
  type InventoryItem,
  type InventoryState,
  type InventoryTransaction,
  type InventoryTransactionAmount,
  type InventoryTransactionCurrency,
  type InventoryTransactionFilter,
} from '../api/inventory.js';
import { artworkForInventoryItem } from './inventoryArtwork.js';
import {
  parseShopCategory,
  SHOP_CATEGORY_META,
  SHOP_CATEGORY_ORDER,
  type ShopCategory,
} from './inventoryShopCategories.js';
import { formatInventoryResourceAmount } from './inventoryResourceLabels.js';
import { updateCachedProfileBalances } from '../app/queryClient.js';

type ShopTab = 'goods' | 'bank' | 'history';
type HistoryFilter = InventoryTransactionFilter;

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
    tokens: 7450,
    priceRub: 149,
    note: 'Первое пополнение',
    bonusLabel: null,
    marker: null,
  },
  {
    id: 'player',
    title: 'Малый запас',
    tokens: 16000,
    priceRub: 299,
    note: 'Для небольших покупок',
    bonusLabel: 'Выгода 7%',
    marker: null,
  },
  {
    id: 'club',
    title: 'Игровой запас',
    tokens: 40000,
    priceRub: 699,
    note: 'Оптимальный выбор',
    bonusLabel: 'Выгода 14%',
    marker: 'Хит',
  },
  {
    id: 'season',
    title: 'Большой запас',
    tokens: 90000,
    priceRub: 1490,
    note: 'Для частых покупок',
    bonusLabel: 'Выгода 21%',
    marker: null,
  },
  {
    id: 'professional',
    title: 'Клубный банк',
    tokens: 190000,
    priceRub: 2990,
    note: 'Серьёзный запас',
    bonusLabel: 'Выгода 27%',
    marker: null,
  },
  {
    id: 'major-league',
    title: 'Премиальный банк',
    tokens: 325000,
    priceRub: 4990,
    note: 'Очень большой запас',
    bonusLabel: 'Выгода 30%',
    marker: 'Топ',
  },
  {
    id: 'maximum',
    title: 'Максимальный банк',
    tokens: 700000,
    priceRub: 9990,
    note: 'Максимальная выгода',
    bonusLabel: 'Выгода 40%',
    marker: 'Премиум',
  },
] as const;

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
  if (item.kind === 'recovery') {
    const minutes = item.effectRecoveryMinutes ?? 0;
    return minutes === 60 ? 'Снимает 1 час' : `Снимает ${minutes} минут`;
  }
  const count = item.chargesPerPurchase || item.chargesAvailable || 5;
  return formatInventoryResourceAmount(item.kind, count, item.resourceUnit);
}

function addedInventoryTitle(item: InventoryItem): string {
  if (item.kind === 'recovery') return `${item.title} добавлен`;
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

function formatTransactionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function transactionDateKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join('-');
}

function transactionDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Без даты';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  }).format(date);
}

export function InventoryScreen(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ShopTab>('goods');
  const [detailsItem, setDetailsItem] = useState<InventoryItem | null>(null);
  const [purchaseItem, setPurchaseItem] = useState<InventoryItem | null>(null);
  const [purchaseNotice, setPurchaseNotice] = useState<{
    title: string;
    amount: string;
    imageUrl: string;
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
      void queryClient.invalidateQueries({ queryKey: ['inventory', 'transactions'] });
      updateCachedProfileBalances(queryClient, {
        currencyBalance: inventory.balances.tokens,
        starBalance: inventory.balances.stars,
        ...(inventory.balances.experience === undefined
          ? {}
          : { experienceBalance: inventory.balances.experience }),
      });
      setPurchaseItem(null);
      setPurchaseNotice({
        title: addedInventoryTitle(item),
        amount: `+${purchaseBundleLabel(item)} в инвентарь`,
        imageUrl: artworkForInventoryItem(item),
      });
      window.setTimeout(() => setPurchaseNotice(null), 2800);
    },
    onError: () => triggerHaptic('error'),
  });

  const inventory = inventoryQuery.data;
  const tokens = inventory?.balances.tokens ?? 0;
  const selectedCategory =
    activeTab === 'goods' ? parseShopCategory(searchParams.get('category')) : null;
  const hasSelectedCategoryItems =
    selectedCategory !== null && (inventory?.items[selectedCategory].length ?? 0) > 0;
  const hasShopItems = SHOP_CATEGORY_ORDER.some(
    (category) => (inventory?.items[category].length ?? 0) > 0,
  );

  const openCategory = (category: ShopCategory): void => {
    const next = new URLSearchParams(searchParams);
    next.set('category', category);
    setSearchParams(next);
  };

  const closeCategory = (): void => {
    const next = new URLSearchParams(searchParams);
    next.delete('category');
    setSearchParams(next, { replace: true });
  };

  const changeTab = (tab: ShopTab): void => {
    setActiveTab(tab);
    if (tab === 'bank' || tab === 'history') closeCategory();
  };

  const openPurchase = (item: InventoryItem): void => {
    purchaseMutation.reset();
    setDetailsItem(null);
    setPurchaseItem(item);
  };

  return (
    <main
      className="screen inventory-shop-screen"
      style={{
        padding: 'calc(22px + var(--app-safe-top)) 14px 24px',
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
          className={`inventory-shop-header${selectedCategory === null ? '' : ' inventory-shop-header--category'}`}
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
            onClick={() => {
              if (selectedCategory !== null) {
                closeCategory();
                return;
              }
              navigate('/sections');
            }}
            aria-label={selectedCategory === null ? 'Назад' : 'К разделам магазина'}
            title={selectedCategory === null ? 'Назад' : 'К разделам магазина'}
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
            {selectedCategory === null ? 'Магазин' : SHOP_CATEGORY_META[selectedCategory].title}
          </h1>
          <ShopBalanceBar tokens={tokens} stars={inventory?.balances.stars ?? 0} />
        </div>

        {selectedCategory === null && <ShopTabs activeTab={activeTab} onChange={changeTab} />}

        {inventoryQuery.isLoading ? (
          <div className="glass" style={{ borderRadius: 22, padding: 16, color: 'var(--muted)' }}>
            Загрузка...
          </div>
        ) : activeTab === 'goods' && selectedCategory !== null && !hasSelectedCategoryItems ? (
          <InventoryEmptyState category />
        ) : activeTab === 'goods' && selectedCategory !== null ? (
          <GoodsCategoryCatalog
            category={selectedCategory}
            inventory={inventory}
            tokens={tokens}
            purchaseMutation={purchaseMutation}
            onDetails={setDetailsItem}
            onBuy={openPurchase}
          />
        ) : activeTab === 'goods' && !hasShopItems ? (
          <InventoryEmptyState />
        ) : activeTab === 'goods' ? (
          <GoodsCategoryOverview onOpenCategory={openCategory} />
        ) : activeTab === 'bank' ? (
          <BankTab />
        ) : (
          <TransactionHistorySection />
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
          role="status"
          aria-live="polite"
          className="inventory-purchase-toast"
        >
          <img
            className="inventory-purchase-toast__artwork"
            src={purchaseNotice.imageUrl}
            alt={purchaseNotice.title.replace(/ (добавлен|добавлена|добавлены|добавлено)$/, '')}
          />
          <div className="inventory-purchase-toast__content">
            <span className="inventory-purchase-toast__status">Покупка добавлена</span>
            <strong>{purchaseNotice.title}</strong>
            <span className="inventory-purchase-toast__amount">{purchaseNotice.amount}</span>
          </div>
        </div>
      )}
    </main>
  );
}

function GoodsCategoryOverview({
  onOpenCategory,
}: {
  onOpenCategory: (category: ShopCategory) => void;
}): JSX.Element {
  return (
    <div className="inventory-category-grid">
      {SHOP_CATEGORY_ORDER.map((category) => {
        const meta = SHOP_CATEGORY_META[category];
        return (
          <button
            key={category}
            type="button"
            className={`inventory-category-card ${meta.className}`}
            aria-label={`Открыть раздел ${meta.title}`}
            onClick={() => onOpenCategory(category)}
          >
            <img src={meta.artworkUrl} alt="" decoding="async" />
            <span className="inventory-category-card__copy">
              <strong>{meta.title}</strong>
              <span>{meta.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function GoodsCategoryCatalog({
  category,
  inventory,
  tokens,
  purchaseMutation,
  onDetails,
  onBuy,
}: {
  category: ShopCategory;
  inventory: InventoryState | undefined;
  tokens: number;
  purchaseMutation: UseMutationResult<InventoryState, Error, InventoryItem>;
  onDetails: (item: InventoryItem) => void;
  onBuy: (item: InventoryItem) => void;
}): JSX.Element {
  const meta = SHOP_CATEGORY_META[category];
  const items = uniqueShopItems(inventory?.items[category] ?? []);

  return (
    <section className="inventory-category-catalog" aria-label={meta.title}>
      <div
        className="inventory-shop-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
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
              onDetails={() => onDetails(item)}
              onBuy={() => onBuy(item)}
            />
          );
        })}
      </div>
    </section>
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
        minHeight: 104,
        padding: 10,
        borderRadius: 22,
        display: 'grid',
        gridTemplateColumns: '52px minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: 10,
        overflow: 'hidden',
      }}
    >
      <div className="inventory-bank-card__icon" aria-hidden="true">
        <CircleDollarSign size={24} strokeWidth={2.35} />
        {pack.marker ? (
          <span
            className={`inventory-bank-card__marker${pack.marker === 'Премиум' ? ' inventory-bank-card__marker--premium' : ''}`}
          >
            {pack.marker}
          </span>
        ) : null}
      </div>
      <div className="inventory-bank-card__copy">
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
          {numberText(pack.tokens)} монет
        </div>
        <div className="inventory-bank-card__meta">
          <span className="inventory-bank-card__note">{pack.note}</span>
          {pack.bonusLabel ? (
            <span className="inventory-bank-card__bonus">{pack.bonusLabel}</span>
          ) : null}
        </div>
      </div>
      <div className="inventory-bank-card__action">
        <strong>{rubText(pack.priceRub)}</strong>
        <button
          type="button"
          className="btn btn--cta"
          disabled
          aria-label={`Купить ${numberText(pack.tokens)} монет за ${rubText(pack.priceRub)}`}
        >
          Скоро
        </button>
      </div>
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
        minHeight: 116,
        padding: 10,
        borderRadius: 22,
        display: 'grid',
        gridTemplateColumns: '94px minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: 12,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onDetails}
        aria-label={`Подробнее о ${item.title}`}
        style={{
          minWidth: 0,
          height: 94,
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
        minWidth: 86,
        minHeight: 38,
        padding: '0 12px',
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

function InventoryEmptyState({ category = false }: { category?: boolean }): JSX.Element {
  return (
    <section
      aria-label={category ? 'Пустой раздел магазина' : 'Пустой магазин'}
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
        {category ? 'В разделе пока нет товаров' : 'Товары скоро появятся'}
      </h2>
      <p
        style={{ margin: 0, color: 'var(--muted)', fontSize: 13, fontWeight: 750, lineHeight: 1.4 }}
      >
        {category
          ? 'Загляните позже или выберите другой раздел магазина.'
          : 'Загляните позже — мы пополняем ассортимент магазина.'}
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

function TransactionHistorySection(): JSX.Element {
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const history = useInfiniteQuery({
    queryKey: ['inventory', 'transactions', filter],
    queryFn: ({ pageParam }) => fetchInventoryTransactions(filter, pageParam, 20),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const transactions = history.data?.pages.flatMap((page) => page.transactions) ?? [];
  const groups = transactions.reduce<
    Array<{ key: string; label: string; entries: InventoryTransaction[] }>
  >((result, entry) => {
    const key = transactionDateKey(entry.createdAt);
    const current = result[result.length - 1];
    if (current?.key === key) {
      current.entries.push(entry);
    } else {
      result.push({ key, label: transactionDateLabel(entry.createdAt), entries: [entry] });
    }
    return result;
  }, []);

  return (
    <section aria-label="История транзакций" style={{ display: 'grid', gap: 8 }}>
      <div className="section-label" style={{ margin: '0 0 0 -14px' }}>
        История
      </div>
      <div className="inventory-history-filters">
        <SegmentedTabs
          items={HISTORY_FILTERS}
          activeTab={filter}
          ariaLabel="Фильтр истории"
          onChange={setFilter}
        />
      </div>
      {groups.length > 0 ? (
        <div className="inventory-history-groups">
          {groups.map((group) => (
            <section key={group.key} className="inventory-history-group">
              <h3 className="section-label">{group.label}</h3>
              <div className="inventory-history-list" role="list" aria-label={`Операции за ${group.label}`}>
                {group.entries.map((entry) => (
                  <article key={entry.id} className="glass inventory-history-row" role="listitem">
                    <div className={`inventory-history-row__icon inventory-history-row__icon--${entry.category}`} aria-hidden="true">
                      {transactionCategoryIcon(entry)}
                    </div>
                    <div className="inventory-history-row__copy">
                      <strong>{entry.title}</strong>
                      <span>{formatTransactionTime(entry.createdAt)} · {transactionSubtitleText(entry)}</span>
                    </div>
                    <div className="inventory-history-row__amounts">
                      {entry.amounts.map((amount) => (
                        <TransactionAmountBadge key={`${entry.id}-${amount.currency}`} amount={amount} />
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
      {history.isLoading ? <div className="inventory-history-empty">Загружаем операции…</div> : null}
      {history.isError ? (
        <div className="inventory-history-empty" role="alert">Не удалось загрузить историю.</div>
      ) : null}
      {!history.isLoading && !history.isError && groups.length === 0 ? (
        <div className="inventory-history-empty">Операций пока нет.</div>
      ) : null}
      {history.hasNextPage ? (
        <button
          type="button"
          className="btn btn--ghost inventory-history-load-more"
          disabled={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          {history.isFetchingNextPage ? 'Загружаем…' : 'Загрузить ещё'}
        </button>
      ) : null}
    </section>
  );
}

function transactionSubtitleText(entry: InventoryTransaction): string {
  const parts = entry.subtitle.split(' · ').filter(Boolean);
  return (parts.length > 1 ? parts.slice(1) : parts).join(' · ');
}

function transactionCategoryIcon(entry: InventoryTransaction): JSX.Element {
  if (entry.category === 'reward') return <Gift size={18} strokeWidth={2.35} />;
  if (entry.category === 'inventory') return <ShoppingBag size={18} strokeWidth={2.35} />;
  if (entry.category === 'bank') return <Landmark size={18} strokeWidth={2.35} />;
  return <Sparkles size={18} strokeWidth={2.35} />;
}

function transactionAmountColor(amount: InventoryTransactionAmount): string {
  if (amount.value < 0) return 'var(--red-deep)';
  if (amount.currency === 'coin') return rewardColor('coin');
  if (amount.currency === 'star') return rewardColor('star');
  if (amount.currency === 'experience') return rewardColor('experience');
  return 'var(--ink)';
}

function transactionAmountIcon(currency: InventoryTransactionCurrency): JSX.Element {
  if (currency === 'coin') return <CircleDollarSign size={13} strokeWidth={2.55} />;
  if (currency === 'star') return <Star size={13} strokeWidth={2.55} fill="currentColor" />;
  if (currency === 'experience') return <TrendingUp size={13} strokeWidth={2.35} />;
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
