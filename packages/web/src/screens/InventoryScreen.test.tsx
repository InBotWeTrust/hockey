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
        chargesPerPurchase: 5,
        rarity: 'legendary',
        powerScore: 8,
        duelPeriodCost: 1,
        chargesAvailable: 5,
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
    expect(screen.getByLabelText('Опыт: 77')).toBeInTheDocument();
    expect(screen.getAllByText('Бронзовая клюшка').length).toBeGreaterThan(0);
    expect(screen.getByText('Золотое питание')).toBeInTheDocument();
    expect(screen.getByText('Серебряные коньки')).toBeInTheDocument();
    expect(screen.getAllByText('5 периодов')).toHaveLength(3);
    expect(screen.queryByText(/Осталось/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/выбрано/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Купить Бронзовая клюшка за 120 монет' })).toBeEnabled();
    expect(screen.getByText('История покупок')).toBeInTheDocument();
    expect(screen.getByText('-120')).toBeInTheDocument();
    expect(document.querySelector('img[src="/inventory/stick-bronze.webp"]')).toBeInTheDocument();
    expect(document.querySelector('img[src="/inventory/sticks.webp"]')).not.toBeInTheDocument();
  });

  it('shows an empty shop state when no products exist', async () => {
    renderInventory();

    expect(await screen.findByText('Товары скоро появятся')).toBeInTheDocument();
  });

  it('opens item details and keeps parameters out of the card', async () => {
    mockInventoryFetch(inventoryWithItems);

    renderInventory();

    expect(await screen.findByRole('button', { name: /Подробнее о Бронзовая клюшка/i })).toBeInTheDocument();
    expect(screen.queryByText('Бросок +24')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Подробнее о Бронзовая клюшка/i }));

    const dialog = screen.getByRole('dialog', { name: 'Бронзовая клюшка' });
    expect(within(dialog).getByText('120 монет')).toBeInTheDocument();
    expect(within(dialog).getByText('Надёжная клюшка для первых дуэлей.')).toBeInTheDocument();
    expect(within(dialog).queryByText('5 периодов')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Купить' })).toBeEnabled();
  });

  it('disables purchase when tokens are not enough', async () => {
    mockInventoryFetch(inventoryWithItems);

    renderInventory();

    expect(await screen.findByText('Серебряные коньки')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Не хватает монет на Серебряные коньки' })).toBeDisabled();
  });

  it('confirms purchase before spending tokens', async () => {
    const purchasedInventory: InventoryState = {
      ...inventoryWithItems,
      balances: { ...inventoryWithItems.balances, tokens: 880 },
      items: {
        ...inventoryWithItems.items,
        stick: [{ ...inventoryWithItems.items.stick[0]!, chargesAvailable: 8 }],
      },
    };
    mockInventoryFetch(inventoryWithItems, purchasedInventory);

    renderInventory();

    expect(await screen.findByRole('button', { name: 'Купить Бронзовая клюшка за 120 монет' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Купить Бронзовая клюшка за 120 монет' }));

    const confirm = screen.getByRole('dialog', { name: 'Купить Бронзовая клюшка?' });
    expect(
      within(confirm).getByText('Будет списано 120 монет. В инвентарь добавится 5 периодов.'),
    ).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Купить' }));

    expect(await screen.findByLabelText('Монеты: 880')).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/inventory/items/stick-bronze/purchase',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
