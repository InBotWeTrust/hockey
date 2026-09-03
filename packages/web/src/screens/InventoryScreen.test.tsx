import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryState } from '../api/inventory.js';
import { InventoryScreen } from './InventoryScreen.js';

const emptyInventory: InventoryState = {
  balances: { tokens: 1000, stars: 2, experience: 77 },
  equipped: { stickItemId: null, skatesItemId: null, nutritionItemId: null },
  items: { stick: [], skates: [], nutrition: [] },
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

    expect(await screen.findByText('Магазин')).toBeInTheDocument();
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
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('1 200')).toBeInTheDocument();
    expect(screen.getByText('3 000')).toBeInTheDocument();
  });

  it('shows transaction history with currency icons and filters', async () => {
    mockInventoryFetch(inventoryWithItems);

    renderInventory();

    fireEvent.click(await screen.findByRole('tab', { name: 'История' }));

    expect(screen.getByRole('button', { name: 'Все' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Начисления' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Списания' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Рубли' })).toBeInTheDocument();
    expect(screen.getByText('Недельная награда')).toBeInTheDocument();
    expect(screen.getByText('Бронзовая клюшка')).toBeInTheDocument();
    expect(screen.getByText('Игровой запас')).toBeInTheDocument();
    expect(screen.getByLabelText('Начисление монет: 100')).toBeInTheDocument();
    expect(screen.getByLabelText('Начисление звёзд: 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Списание монет: 120')).toBeInTheDocument();
    expect(screen.getByLabelText('Списание рублей: 299 ₽')).toBeInTheDocument();
    expect(screen.getByText(/банк · Оплачено/)).toBeInTheDocument();
    expect(screen.getByText(/товар · 5 бросков/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Начисления' }));
    expect(screen.getByText('Недельная награда')).toBeInTheDocument();
    expect(screen.queryByText('Бронзовая клюшка')).not.toBeInTheDocument();
    expect(screen.queryByText('Игровой запас')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Рубли' }));
    expect(screen.getByText('Игровой запас')).toBeInTheDocument();
    expect(screen.queryByText('Недельная награда')).not.toBeInTheDocument();
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
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/inventory/items/stick-bronze/purchase',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(vibrate).toHaveBeenCalledWith([10, 35, 15]);
  });
});
