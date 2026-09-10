import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { InventoryState } from '../api/inventory.js';
import {
  ProfileArenaScreen,
  ProfileEquipmentScreen,
  ProfileStatsScreen,
} from './ProfileDestinationScreens.js';

const profile = {
  id: 'u1',
  displayName: 'Alice',
  grip: 'right' as const,
  competitionLevel: 'beginner' as const,
  stats: { shots: 120, goals: 48, accuracy: 40, playStreakDays: 3, bestPlayStreakDays: 8 },
  achievements: [],
};

function renderDestination(path: string, element: JSX.Element): RenderResult {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path} element={element} />
          <Route path="/inventory" element={<div>inventory screen</div>} />
          <Route path="/profile" element={<div>profile screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

let inventoryResponse: InventoryState;

beforeEach(() => {
  inventoryResponse = {
    balances: { tokens: 1, stars: 2, experience: 3 },
    equipped: { stickItemId: 'stick-1', skatesItemId: null, nutritionItemId: null },
    items: {
      stick: [
        {
          id: 'stick-1',
          kind: 'stick',
          title: 'Точная клюшка',
          description: '',
          imageUrl: null,
          currencyPrice: 0,
          chargesPerPurchase: 0,
          rarity: 'common',
          powerScore: 0,
          duelPeriodCost: 0,
          chargesAvailable: 25,
          chargesReserved: 0,
        },
      ],
      skates: [],
      nutrition: [],
      recovery: [],
    },
  };
  vi.restoreAllMocks();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/api/me')) return new Response(JSON.stringify(profile), { status: 200 });
    if (url.endsWith('/api/inventory/me')) {
      return new Response(JSON.stringify(inventoryResponse), { status: 200 });
    }
    if (url.endsWith('/api/me/home-arenas')) {
      return new Response(
        JSON.stringify({
          arenas: [
            {
              id: 'a1',
              selection_id: null,
              slug: 'default',
              title: 'Главный лёд',
              artwork_url: 'arena.webp',
              thumbnail_url: 'arena-thumb.webp',
            },
          ],
          selected_arena: {
            id: 'a1',
            selection_id: null,
            slug: 'default',
            title: 'Главный лёд',
            artwork_url: 'arena.webp',
            thumbnail_url: 'arena-thumb.webp',
          },
        }),
        { status: 200 },
      );
    }
    return new Response('not found', { status: 404 });
  });
});

describe('profile destination screens', () => {
  it('shows aggregate statistics without inventing mode totals', async () => {
    renderDestination('/profile/stats', <ProfileStatsScreen />);
    expect(await screen.findByRole('heading', { name: 'Статистика' })).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Каждый уникальный бросок учитывается один раз — результаты турниров не дублируют ежедневную игру.',
      ),
    ).toBeInTheDocument();
  });

  it('shows equipped items and links to the existing shop', async () => {
    renderDestination('/profile/equipment', <ProfileEquipmentScreen />);
    expect(await screen.findByRole('heading', { name: 'Инвентарь' })).toBeInTheDocument();
    expect(await screen.findByText('Точная клюшка')).toBeInTheDocument();
    expect(screen.getByText('Клюшка')).toBeInTheDocument();
    expect(screen.getByText('Коньки')).toBeInTheDocument();
    expect(screen.getByText('Питание')).toBeInTheDocument();
    expect(screen.getByText('Обычные коньки')).toBeInTheDocument();
    expect(screen.getByText('Без питания')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'В магазин' }));
    expect(screen.getByText('inventory screen')).toBeInTheDocument();
  });

  it('reuses the interactive duel locker layout on the profile inventory page', async () => {
    const view = renderDestination('/profile/equipment', <ProfileEquipmentScreen />);
    const heading = await screen.findByRole('heading', { name: 'Инвентарь' });

    expect(heading).toHaveClass('bonus-games-catalog__title');
    expect(view.container.querySelectorAll('.duel-locker-slot')).toHaveLength(4);
    expect(screen.getByText('Осталось 25 бросков')).toBeInTheDocument();
    expect(screen.getByText('Наборы для восстановления')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Клюшка: Точная клюшка/ }));
    expect(await screen.findByRole('dialog', { name: 'Клюшка' })).toBeInTheDocument();
  });

  it('shows base artwork for every empty beginner equipment slot', async () => {
    inventoryResponse = {
      ...inventoryResponse,
      equipped: { stickItemId: null, skatesItemId: null, nutritionItemId: null },
    };

    const view = renderDestination('/profile/equipment', <ProfileEquipmentScreen />);
    expect(await screen.findByRole('heading', { name: 'Инвентарь' })).toBeInTheDocument();
    expect(view.container.querySelector('img[src*="/inventory/stick-base.webp"]')).not.toBeNull();
    expect(view.container.querySelector('img[src*="/inventory/skates-base.webp"]')).not.toBeNull();
    expect(
      view.container.querySelector('img[src*="/inventory/nutrition-none.webp"]'),
    ).not.toBeNull();
  });

  it('replaces a broken equipped item image with its base artwork without retrying it', async () => {
    const stick = inventoryResponse.items.stick[0];
    if (stick === undefined) throw new Error('stick fixture is missing');
    inventoryResponse = {
      ...inventoryResponse,
      items: {
        ...inventoryResponse.items,
        stick: [{ ...stick, imageUrl: '/inventory/broken-stick.webp' }],
      },
    };

    const view = renderDestination('/profile/equipment', <ProfileEquipmentScreen />);
    expect(await screen.findByText('Точная клюшка')).toBeInTheDocument();
    const image = view.container.querySelector<HTMLImageElement>(
      'img[src^="/inventory/broken-stick.webp"]',
    );
    expect(image).not.toBeNull();

    fireEvent.error(image!);
    expect(image).toHaveAttribute('src', expect.stringContaining('/inventory/stick-base.webp'));
    const fallbackSource = image!.getAttribute('src');
    fireEvent.error(image!);
    expect(image).toHaveAttribute('src', fallbackSource);
  });

  it('shows the selected arena and opens the existing picker', async () => {
    renderDestination('/profile/arena', <ProfileArenaScreen />);
    expect(await screen.findByText('Главный лёд')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать площадку' }));
    expect(await screen.findByRole('dialog', { name: 'Домашняя площадка' })).toBeInTheDocument();
  });
});
