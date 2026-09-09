import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryState } from '../api/inventory.js';
import { InventoryScreen } from './InventoryScreen.js';

const emptyInventory: InventoryState = {
  balances: { tokens: 1000, stars: 2, experience: 77 },
  equipped: { stickItemId: null, skatesItemId: null, nutritionItemId: null },
  items: { stick: [], skates: [], nutrition: [], recovery: [] },
};

const inventoryWithItems: InventoryState = {
  balances: { tokens: 1000, stars: 2, experience: 77 },
  equipped: {
    stickItemId: 'stick-bronze',
    skatesItemId: null,
    nutritionItemId: 'nutrition-gold',
  },
  items: {
    stick: [
      {
        id: 'stick-bronze',
        kind: 'stick',
        title: 'Бронзовая клюшка',
        description: 'Надёжная клюшка для первых дуэлей.',
        imageUrl: '/inventory/sticks.webp',
        currencyPrice: 120,
        chargesPerPurchase: 5,
        resourceUnit: 'shot',
        rarity: 'common',
        powerScore: 24,
        duelPeriodCost: 1,
        chargesAvailable: 3,
        chargesReserved: 0,
      },
    ],
    skates: [
      {
        id: 'skates-empty',
        kind: 'skates',
        title: 'Серебряные коньки',
        description: 'Быстрее выводят игрока в зону броска.',
        imageUrl: null,
        currencyPrice: 1500,
        chargesPerPurchase: 5,
        resourceUnit: 'distance',
        rarity: 'rare',
        powerScore: 12,
        duelPeriodCost: 1,
        chargesAvailable: 0,
        chargesReserved: 0,
      },
    ],
    nutrition: [
      {
        id: 'nutrition-gold',
        kind: 'nutrition',
        title: 'Золотое питание',
        description: 'Держит концентрацию в конце периода.',
        imageUrl: null,
        currencyPrice: 60,
        chargesPerPurchase: 300_000,
        resourceUnit: 'energy_ms',
        rarity: 'legendary',
        powerScore: 8,
        duelPeriodCost: 1,
        chargesAvailable: 300_000,
        chargesReserved: 1,
      },
    ],
    recovery: [
      {
        id: 'recovery-15',
        kind: 'recovery',
        title: 'Малый набор для восстановления',
        description: 'Сокращает текущее восстановление на 15 минут.',
        imageUrl: '/inventory/recovery-15.webp',
        currencyPrice: 600,
        chargesPerPurchase: 1,
        resourceUnit: 'period',
        rarity: 'common',
        powerScore: 0,
        duelPeriodCost: 0,
        effectRecoveryMinutes: 15,
        chargesAvailable: 0,
        chargesReserved: 0,
      },
      {
        id: 'recovery-30',
        kind: 'recovery',
        title: 'Набор для восстановления',
        description: 'Сокращает текущее восстановление на 30 минут.',
        imageUrl: '/inventory/recovery-30.webp',
        currencyPrice: 1000,
        chargesPerPurchase: 1,
        resourceUnit: 'period',
        rarity: 'rare',
        powerScore: 0,
        duelPeriodCost: 0,
        effectRecoveryMinutes: 30,
        chargesAvailable: 0,
        chargesReserved: 0,
      },
      {
        id: 'recovery-60',
        kind: 'recovery',
        title: 'Большой набор для восстановления',
        description: 'Полностью снимает часовое восстановление.',
        imageUrl: '/inventory/recovery-60.webp',
        currencyPrice: 1800,
        chargesPerPurchase: 1,
        resourceUnit: 'period',
        rarity: 'legendary',
        powerScore: 0,
        duelPeriodCost: 0,
        effectRecoveryMinutes: 60,
        chargesAvailable: 0,
        chargesReserved: 0,
      },
    ],
  },
  purchaseHistory: [
    {
      id: 'ledger-1',
      itemId: 'stick-bronze',
      title: 'Бронзовая клюшка',
      kind: 'stick',
      tokensSpent: 120,
      chargesAdded: 5,
      createdAt: '2026-05-27T10:15:00.000Z',
    },
  ],
  bankHistory: [
    {
      id: 'payment-1',
      title: 'Игровой запас',
      amountRub: 299,
      status: 'paid',
      createdAt: '2026-05-27T10:10:00.000Z',
      paidAt: '2026-05-27T10:11:00.000Z',
    },
  ],
  transactionHistory: [
    {
      id: 'reward-1',
      title: 'Недельная награда',
      subtitle: '27.05, 10:20 · награда',
      category: 'reward',
      flow: 'credit',
      amounts: [
        { currency: 'coin', value: 100 },
        { currency: 'star', value: 2 },
        { currency: 'experience', value: 10 },
      ],
      createdAt: '2026-05-27T10:20:00.000Z',
    },
    {
      id: 'inventory-ledger-1',
      title: 'Бронзовая клюшка',
      subtitle: '27.05, 10:15 · товар · 5 бросков',
      category: 'inventory',
      flow: 'debit',
      amounts: [{ currency: 'coin', value: -120 }],
      createdAt: '2026-05-27T10:15:00.000Z',
    },
    {
      id: 'bank-payment-1',
      title: 'Игровой запас',
      subtitle: '27.05, 10:10 · банк · Оплачено',
      category: 'bank',
      flow: 'debit',
      amounts: [{ currency: 'ruble', value: -299 }],
      createdAt: '2026-05-27T10:10:00.000Z',
    },
  ],
};

function mockInventoryFetch(inventory: InventoryState, purchasedInventory = inventory): void {
  vi.restoreAllMocks();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith('/api/inventory/me')) {
      return new Response(JSON.stringify(inventory), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/api/inventory/transactions')) {
      const parsed = new URL(url, 'http://localhost');
      const filter = parsed.searchParams.get('filter') ?? 'all';
      const cursor = parsed.searchParams.get('cursor');
      const matching = (inventory.transactionHistory ?? []).filter((entry) => {
        if (filter === 'credit') return entry.flow === 'credit';
        if (filter === 'debit') return entry.flow === 'debit' && entry.category !== 'bank';
        if (filter === 'ruble') return entry.amounts.some((amount) => amount.currency === 'ruble');
        return true;
      });
      const offset = cursor === null ? 0 : 20;
      return new Response(
        JSON.stringify({
          transactions: matching.slice(offset, offset + 20),
          nextCursor: matching.length > offset + 20 ? 'next-page' : null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.endsWith('/api/inventory/equipment') && init?.method === 'PATCH') {
      return new Response(JSON.stringify(inventory), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.endsWith('/api/inventory/items/stick-bronze/purchase') && init?.method === 'POST') {
      return new Response(JSON.stringify(purchasedInventory), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: { code: 'not_found', message: 'not found' } }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  });
}

function renderInventory(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/inventory']}>
        <Routes>
          <Route path="/inventory" element={<InventoryScreen />} />
          <Route path="/sections" element={<div>sections screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('InventoryScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockInventoryFetch(emptyInventory);
  });

  it('renders the shop catalog as product cards', async () => {
    mockInventoryFetch(inventoryWithItems);

    renderInventory();

    expect(await screen.findByRole('heading', { name: 'Магазин' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Монеты: 1 000')).toBeInTheDocument();
    expect(screen.getByLabelText('Звёзды: 2')).toBeInTheDocument();
    expect(screen.queryByLabelText('Опыт: 77')).toBeNull();
    expect(screen.getAllByText('Бронзовая клюшка').length).toBeGreaterThan(0);
    expect(screen.getByText('Золотое питание')).toBeInTheDocument();
    expect(screen.getByText('Серебряные коньки')).toBeInTheDocument();
    expect(screen.getByText('5 бросков')).toBeInTheDocument();
    expect(screen.getByText('5 прокатов')).toBeInTheDocument();
    expect(screen.getByText('5 минут энергии')).toBeInTheDocument();
    expect(screen.queryByText(/Осталось/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/выбрано/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Купить Бронзовая клюшка за 120 монет' }),
    ).toBeEnabled();
    expect(screen.getByRole('tab', { name: 'Товары' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Банк' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'История' })).toBeInTheDocument();
    expect(screen.queryByText('-120')).not.toBeInTheDocument();
    expect(document.querySelector('img[src^="/inventory/stick-bronze.webp"]')).toBeInTheDocument();
    expect(document.querySelector('img[src="/inventory/sticks.webp"]')).not.toBeInTheDocument();
    expect(document.querySelector('.inventory-shop-grid')).toBeInTheDocument();
    expect(document.querySelector('.inventory-shop-header')).toBeInTheDocument();
    expect(document.querySelector('.inventory-shop-balance')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Клюшки' })).getByText('Бронзовая клюшка')
        .closest('.inventory-product-card'),
    ).toBeInTheDocument();
  });

  it('shows only one shop card per equipment rarity', async () => {
    const duplicatedInventory: InventoryState = {
      ...inventoryWithItems,
      items: {
        ...inventoryWithItems.items,
        stick: [
          inventoryWithItems.items.stick[0]!,
          {
            ...inventoryWithItems.items.stick[0]!,
            id: 'stick-bronze-duplicate',
          },
        ],
      },
    };
    mockInventoryFetch(duplicatedInventory);

    renderInventory();

    expect(
      await screen.findByRole('button', { name: /Подробнее о Бронзовая клюшка/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Подробнее о Бронзовая клюшка/i })).toHaveLength(
      1,
    );
  });

  it('shows the three recovery kits with their agreed durations and prices', async () => {
    mockInventoryFetch(inventoryWithItems);
    renderInventory();

    const recovery = await screen.findByRole('region', { name: 'Восстановление' });
    expect(within(recovery).getByText('Малый набор для восстановления')).toBeInTheDocument();
    expect(within(recovery).getByText('Набор для восстановления')).toBeInTheDocument();
    expect(within(recovery).getByText('Большой набор для восстановления')).toBeInTheDocument();
    expect(within(recovery).getByText('Снимает 15 минут')).toBeInTheDocument();
    expect(within(recovery).getByText('Снимает 30 минут')).toBeInTheDocument();
    expect(within(recovery).getByText('Снимает 1 час')).toBeInTheDocument();
    expect(within(recovery).getByLabelText('600 монет')).toBeInTheDocument();
    expect(within(recovery).getAllByLabelText(/1.000 монет/)).not.toHaveLength(0);
    expect(within(recovery).getAllByLabelText(/1.800 монет/)).not.toHaveLength(0);
  });

  it('reserves two product description lines in shop cards', async () => {
    mockInventoryFetch(inventoryWithItems);

    renderInventory();

    expect(await screen.findByText('5 бросков')).toHaveStyle({ minHeight: '2.4em' });
    expect(screen.getByText('5 прокатов')).toHaveStyle({ minHeight: '2.4em' });
    expect(screen.getByText('5 минут энергии')).toHaveStyle({ minHeight: '2.4em' });
  });

  it('shows bank packages on the bank tab', async () => {
    mockInventoryFetch(inventoryWithItems);

    renderInventory();

    fireEvent.click(await screen.findByRole('tab', { name: 'Банк' }));

    expect(screen.getByText('Стартовый набор')).toBeInTheDocument();
    expect(screen.getByText('Игровой запас')).toBeInTheDocument();
    expect(screen.getByText('Клубный банк')).toBeInTheDocument();
    expect(screen.getByText('7 450 монет')).toBeInTheDocument();
    expect(screen.getByText('14 950 монет')).toBeInTheDocument();
    expect(screen.getByText('34 950 монет')).toBeInTheDocument();
  });

  it('shows transaction history with currency icons and filters', async () => {
    mockInventoryFetch(inventoryWithItems);

    renderInventory();

    expect(
      vi.mocked(globalThis.fetch).mock.calls.some(([input]) =>
        String(input).includes('/api/inventory/transactions'),
      ),
    ).toBe(false);

    fireEvent.click(await screen.findByRole('tab', { name: 'История' }));

    const filters = await screen.findByRole('tablist', { name: 'Фильтр истории' });
    expect(filters).toHaveClass('segmented-tabs');
    expect(screen.getByRole('tab', { name: 'Все', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Начисления' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Списания' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Рубли' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 3, name: '27 мая' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Операции за 27 мая' })).toBeInTheDocument();
    expect(screen.getByText('Недельная награда')).toBeInTheDocument();
    expect(screen.getByText('Бронзовая клюшка')).toBeInTheDocument();
    expect(screen.getByText('Игровой запас')).toBeInTheDocument();
    expect(screen.getByLabelText('Начисление монет: 100')).toHaveStyle({
      color: 'var(--reward-coin)',
    });
    expect(screen.getByLabelText('Начисление звёзд: 2')).toHaveStyle({
      color: 'var(--reward-star)',
    });
    const experienceCredit = screen.getByLabelText('Начисление опыта: 10');
    expect(experienceCredit).toHaveStyle({
      color: 'var(--reward-experience)',
    });
    expect(experienceCredit.querySelector('svg')).toHaveClass('lucide-trending-up');
    expect(screen.getByLabelText('Списание монет: 120')).toHaveStyle({
      color: 'var(--red-deep)',
    });
    expect(screen.getByLabelText('Списание рублей: 299 ₽')).toHaveStyle({
      color: 'var(--red-deep)',
    });
    expect(screen.getByText(/банк · Оплачено/)).toBeInTheDocument();
    expect(screen.getByText(/товар · 5 бросков/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Начисления' }));
    expect(await screen.findByText('Недельная награда')).toBeInTheDocument();
    expect(screen.queryByText('Бронзовая клюшка')).not.toBeInTheDocument();
    expect(screen.queryByText('Игровой запас')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Рубли' }));
    expect(await screen.findByText('Игровой запас')).toBeInTheDocument();
    expect(screen.queryByText('Недельная награда')).not.toBeInTheDocument();
  });

  it('loads transaction history in pages of twenty', async () => {
    const transactions = Array.from({ length: 21 }, (_, index) => ({
      id: `reward-${index + 1}`,
      title: `Награда ${index + 1}`,
      subtitle: '06.09, 18:42 · достижение',
      category: 'reward' as const,
      flow: 'credit' as const,
      amounts: [{ currency: 'coin' as const, value: index + 1 }],
      createdAt: new Date(Date.UTC(2026, 8, 6, 15, 42, 21 - index)).toISOString(),
    }));
    mockInventoryFetch({ ...inventoryWithItems, transactionHistory: transactions });

    renderInventory();
    fireEvent.click(await screen.findByRole('tab', { name: 'История' }));

    expect(await screen.findByText('Награда 20')).toBeInTheDocument();
    expect(screen.queryByText('Награда 21')).toBeNull();
    const loadMore = screen.getByRole('button', { name: 'Загрузить ещё' });
    fireEvent.click(loadMore);

    expect(await screen.findByText('Награда 21')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Загрузить ещё' })).toBeNull();
  });

  it('shows an unboxed empty state for a filtered transaction history', async () => {
    mockInventoryFetch({
      ...inventoryWithItems,
      purchaseHistory: [],
      bankHistory: [],
      transactionHistory: [],
    });

    renderInventory();

    fireEvent.click(await screen.findByRole('tab', { name: 'История' }));
    const empty = await screen.findByText('Операций пока нет.');
    expect(empty.closest('.glass')).toBeNull();
  });

  it('shows an empty shop state when no products exist', async () => {
    renderInventory();

    expect(await screen.findByText('Товары скоро появятся')).toBeInTheDocument();
  });

  it('opens item details and keeps parameters out of the card', async () => {
    mockInventoryFetch(inventoryWithItems);

    renderInventory();

    expect(
      await screen.findByRole('button', { name: /Подробнее о Бронзовая клюшка/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Бросок +24')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Подробнее о Бронзовая клюшка/i }));

    const dialog = screen.getByRole('dialog', { name: 'Бронзовая клюшка' });
    expect(within(dialog).getByText('120 монет')).toBeInTheDocument();
    expect(within(dialog).getByText('5 бросков')).toBeInTheDocument();
    expect(within(dialog).getByText('Надёжная клюшка для первых дуэлей.')).toBeInTheDocument();
    expect(within(dialog).queryByText('5 периодов')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Купить' })).toBeEnabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Бронзовая клюшка' })).not.toBeInTheDocument();
  });

  it('disables purchase when tokens are not enough', async () => {
    mockInventoryFetch(inventoryWithItems);

    renderInventory();

    expect(await screen.findByText('Серебряные коньки')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Не хватает монет на Серебряные коньки' }),
    ).toBeDisabled();
  });

  it('confirms purchase before spending tokens', async () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(window.navigator, 'vibrate', { configurable: true, value: vibrate });
    const inventoryWithInstanceItem: InventoryState = {
      ...inventoryWithItems,
      equipped: { ...inventoryWithItems.equipped, stickItemId: 'instance-stick-bronze' },
      items: {
        ...inventoryWithItems.items,
        stick: [
          {
            ...inventoryWithItems.items.stick[0]!,
            id: 'instance-stick-bronze',
            itemId: 'stick-bronze',
            instanceId: 'instance-stick-bronze',
          },
        ],
      },
    };
    const purchasedInventory: InventoryState = {
      ...inventoryWithInstanceItem,
      balances: { ...inventoryWithInstanceItem.balances, tokens: 880 },
      items: {
        ...inventoryWithInstanceItem.items,
        stick: [{ ...inventoryWithInstanceItem.items.stick[0]!, chargesAvailable: 8 }],
      },
    };
    mockInventoryFetch(inventoryWithInstanceItem, purchasedInventory);

    renderInventory();

    expect(
      await screen.findByRole('button', { name: 'Купить Бронзовая клюшка за 120 монет' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Купить Бронзовая клюшка за 120 монет' }));

    const confirm = screen.getByRole('dialog', { name: 'Купить Бронзовая клюшка?' });
    expect(document.body.firstElementChild).toHaveAttribute('inert');
    expect(
      within(confirm).getByText('Будет списано 120 монет. В инвентарь добавится 5 бросков.'),
    ).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Купить' }));

    expect(await screen.findByLabelText('Монеты: 880')).toBeInTheDocument();
    expect(await screen.findByText('Бронзовая клюшка добавлена')).toBeInTheDocument();
    expect(screen.getByText('+5 бросков в инвентарь')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('inventory-purchase-toast');
    expect(screen.getByRole('img', { name: 'Бронзовая клюшка' })).toHaveAttribute(
      'src',
      '/inventory/stick-bronze.webp?v=20260830-base-equipment-v1',
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/inventory/items/stick-bronze/purchase',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(vibrate).toHaveBeenCalledWith([10, 35, 15]);
  });
});
