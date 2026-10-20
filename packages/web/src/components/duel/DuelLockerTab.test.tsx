import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DuelLockerTab } from './DuelLockerTab.js';
import { fetchMyInventory, patchEquipment, type InventoryState } from '../../api/inventory.js';
vi.mock('../../api/inventory.js', () => ({ fetchMyInventory: vi.fn(), patchEquipment: vi.fn() }));
vi.mock('../../feedback/haptics.js', () => ({ triggerHaptic: vi.fn() }));
const empty: InventoryState = {
  balances: { tokens: 0, stars: 0, experience: 0 },
  equipped: { stickItemId: null, skatesItemId: null, nutritionItemId: null },
  items: { stick: [], skates: [], nutrition: [], recovery: [] },
};
const stock: InventoryState = {
  ...empty,
  items: {
    ...empty.items,
    stick: [
      {
        id: 'stick-1',
        kind: 'stick',
        title: 'Точная клюшка',
        description: '',
        imageUrl: null,
        currencyPrice: 0,
        chargesPerPurchase: 30,
        rarity: 'rare',
        powerScore: 2,
        duelPeriodCost: 1,
        chargesAvailable: 25,
        chargesReserved: 0,
      },
    ],
  },
};
const shop = vi.fn();
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DuelLockerTab onInfo={vi.fn()} onOpenInventory={shop} />
    </QueryClientProvider>,
  );
  return client;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchMyInventory).mockResolvedValue(structuredClone(stock));
});
it('shows loading without pretending that missing inventory is a base selection', () => {
  vi.mocked(fetchMyInventory).mockReturnValue(new Promise(() => {}));
  mount();
  expect(screen.getByRole('status')).toHaveTextContent('Загружаем инвентарь');
  expect(screen.queryByRole('button', { name: /Клюшка: Обычная/ })).toBeNull();
});
it('offers retry after a failed inventory request', async () => {
  vi.mocked(fetchMyInventory).mockRejectedValueOnce(new Error('offline'));
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить инвентарь');
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  expect(await screen.findByRole('button', { name: /Клюшка: Обычная/ })).toBeVisible();
});
it('waits for confirmation then updates the shared equipment query', async () => {
  let confirm!: (value: InventoryState) => void;
  vi.mocked(patchEquipment).mockReturnValue(
    new Promise((resolve) => {
      confirm = resolve;
    }),
  );
  const client = mount();
  fireEvent.click(await screen.findByRole('button', { name: /Клюшка: Обычная/ }));
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: /Точная клюшка/ }),
  );
  await waitFor(() => expect(patchEquipment).toHaveBeenCalledWith({ stickItemId: 'stick-1' }));
  expect(client.getQueryData<InventoryState>(['inventory', 'me'])?.equipped.stickItemId).toBeNull();
  confirm({ ...stock, equipped: { ...stock.equipped, stickItemId: 'stick-1' } });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(client.getQueryData<InventoryState>(['inventory', 'me'])?.equipped.stickItemId).toBe(
    'stick-1',
  );
  expect(screen.getByRole('button', { name: /Клюшка: Точная клюшка/ })).toBeVisible();
});
it('preserves confirmed equipment after a failed patch', async () => {
  vi.mocked(patchEquipment).mockRejectedValue(new Error('Выбор не сохранён'));
  const client = mount();
  fireEvent.click(await screen.findByRole('button', { name: /Клюшка: Обычная/ }));
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: /Точная клюшка/ }),
  );
  expect(await screen.findByText('Выбор не сохранён')).toBeVisible();
  expect(client.getQueryData<InventoryState>(['inventory', 'me'])?.equipped.stickItemId).toBeNull();
});
it('keeps empty and depleted items unavailable and recovery accessible', async () => {
  vi.mocked(fetchMyInventory).mockResolvedValue({
    ...stock,
    items: { ...stock.items, stick: stock.items.stick.map((i) => ({ ...i, chargesAvailable: 0 })) },
  });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: /Восстановление:/ }));
  expect(shop).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: /Клюшка: Обычная/ }));
  expect(
    within(screen.getByRole('dialog')).queryByRole('button', { name: /Точная клюшка/ }),
  ).toBeNull();
  expect(
    within(screen.getByRole('dialog')).getByRole('button', { name: /Обычная клюшка/ }),
  ).toBeVisible();
});
