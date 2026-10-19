import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LockerRoomScreen } from './LockerRoomScreen.js';
import { apiFetch } from '../api/apiFetch.js';
import { fetchMyInventory } from '../api/inventory.js';
vi.mock('../api/apiFetch.js', () => ({ apiFetch: vi.fn() }));
vi.mock('../api/inventory.js', () => ({ fetchMyInventory: vi.fn(), patchEquipment: vi.fn() }));
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/locker-room']}>
        <Routes>
          <Route path="/locker-room" element={<LockerRoomScreen />} />
          <Route path="/sections" element={<p>Карта</p>} />
          <Route path="/inventory" element={<p>Магазин</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.mocked(apiFetch).mockResolvedValue({ competitionLevel: 'beginner' });
  vi.mocked(fetchMyInventory).mockResolvedValue({
    balances: { tokens: 0, stars: 0, experience: 0 },
    equipped: { stickItemId: null, skatesItemId: null, nutritionItemId: null },
    items: { stick: [], skates: [], nutrition: [], recovery: [] },
  });
});
it.each([
  ['beginner', 'beginner'],
  ['amateur', 'amateur'],
  ['professional', 'detailed'],
])('uses the existing %s background and only one page', async (level, image) => {
  vi.mocked(apiFetch).mockResolvedValue({ competitionLevel: level });
  mount();
  await screen.findByRole('button', { name: /Клюшка: Обычная/ });
  expect(document.querySelector('.locker-room-scene .section-scene__panorama img')).toHaveAttribute(
    'src',
    `/backgrounds/locker-room-${image}.webp`,
  );
  expect(screen.getAllByRole('tab')).toHaveLength(1);
  expect(screen.getByRole('tab', { name: 'Инвентарь' })).toHaveAttribute('aria-selected', 'true');
  const exit = screen.getByRole('link', { name: 'На карту' });
  expect(
    exit.compareDocumentPosition(screen.getByRole('tab')) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('tab'), { key: 'ArrowRight' });
  expect(screen.getAllByRole('tab')).toHaveLength(1);
  fireEvent.click(exit);
  expect(screen.getByText('Карта')).toBeVisible();
});
it('keeps exit during loading and lets profile loading retry without mounting equipment', async () => {
  vi.mocked(apiFetch).mockRejectedValueOnce(new Error('offline'));
  mount();
  expect(screen.getByRole('link', { name: 'На карту' })).toBeVisible();
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить раздевалку');
  expect(fetchMyInventory).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  await screen.findByRole('button', { name: /Клюшка: Обычная/ });
});
it('opens information and the existing shop without introducing clothing controls', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Что такое раздевалка' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('клюшка');
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
  fireEvent.click(screen.getByRole('button', { name: 'В магазин' }));
  await waitFor(() => expect(screen.getByText('Магазин')).toBeVisible());
});
