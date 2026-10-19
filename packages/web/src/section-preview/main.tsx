import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InventoryScreen } from '../screens/InventoryScreen.js';
import { BonusGamesScreen } from '../screens/BonusGamesScreen.js';
import { inventoryWithItems, coinPackages, card } from './fixtures.js';
import '../app/global.css';
import '../app/design-system.css';
import '../app/liquid-glass.css';

// Local-only visual fixtures. No account/session mutation and no requests to a live API.
if (!import.meta.env.DEV) throw new Error('Local preview only');
const params = new URLSearchParams(location.search),
  scene = params.get('scene') ?? 'shop';
const inventory = structuredClone(inventoryWithItems);
inventory.balances = { tokens: 43509, stars: 1860, experience: 77 };
for (const kind of ['stick', 'skates', 'nutrition', 'recovery'] as const) {
  const item = inventory.items[kind][0]!;
  inventory.items[kind] = Array.from({ length: 3 }, (_, i) => ({
    ...item,
    id: `${kind}-${i}`,
    rarity: (['common', 'rare', 'legendary'] as const)[i]!,
    title: `${{ stick: 'Ультимейт Ван', skates: 'Коньки Ультимейт', nutrition: 'Спортивное питание', recovery: 'Восстановление' }[kind]} ${i + 1}`,
    chargesPerPurchase: 1800 + i * 2000,
    currencyPrice: 3750 + i * 3750,
    starPrice: 150 + i * 150,
  }));
}
const skills = ['speed', 'accuracy', 'marksmanship', 'endurance', 'rhythm', 'challenge'];
const titles = ['Скорость', 'Точность', 'Меткость', 'Выносливость', 'Ритм', 'Испытания'];
const images = [
  '/bonus-games/nhl-cities/arenas/boston.webp',
  '/bonus-games/nhl-cities/arenas/chicago.webp',
];
const games = skills.flatMap((skill, index) =>
  Array.from({ length: 10 }, (_, i) =>
    card({
      id: `${skill}-${i}`,
      slug: skill === 'challenge' ? 'challenge-beach' : `${skill}-${i}`,
      title: `${titles[index]} · Локация ${i + 1}`,
      preview_title: `${titles[index]} · Локация ${i + 1}`,
      skill_code: skill,
      state: i === 0 ? 'available' : 'completed',
      is_completed: i > 0,
      arena: {
        title: `Локация ${i + 1}`,
        artwork_url: images[i % 2],
        thumbnail_url: images[i % 2],
      },
      preview_artwork_url: images[i % 2],
    }),
  ),
);
window.fetch = async (input, init) => {
  const url = String(input);
  if (!url.includes('/api/')) return Response.error();
  let data: unknown = {};
  if (url.includes('/bar/visitor'))
    data = {
      revision: 1,
      settings: {
        cardDays: 30,
        products: [
          {
            id: 'card',
            kind: 'card',
            title: 'Карта посетителя',
            amount: 1,
            coins: 15000,
            stars: 600,
          },
        ],
      },
      state: { card: { active: false, expiresAt: null } },
    };
  else if (url.includes('/inventory/me') || url.includes('/inventory/items/')) data = inventory;
  else if (url.includes('/inventory/transactions'))
    data = {
      transactions: Array.from({ length: 12 }, (_, i) => ({
        ...inventoryWithItems.transactionHistory![
          i % inventoryWithItems.transactionHistory!.length
        ],
        id: `t${i}`,
      })),
      total: 12,
      nextOffset: null,
    };
  else if (url.includes('/bank/packages')) data = { packages: coinPackages };
  else if (url.includes('/bank/receipt-email')) data = { receiptEmail: null };
  else if (url.endsWith('/bonus-games')) data = { games, active_attempt: null };
  else if (url.includes('/records')) data = { rows: [], currentUser: null, nextOffset: null };
  else if (init?.method && init.method !== 'GET')
    data = { error: 'preview_only', message: 'Локальный просмотр' };
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
const initial =
  scene === 'bonus'
    ? `/bonus-games?skill=${params.get('skill') ?? 'speed'}`
    : scene === 'bank'
      ? `/inventory?tab=${params.get('tab') ?? 'bank'}`
      : `/inventory?category=${params.get('category') ?? 'stick'}`;
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider
    client={
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      })
    }
  >
    <MemoryRouter initialEntries={[initial]}>
      <div
        className="app-shell app-shell--unified-glass"
        style={{ height: '100dvh', width: '100%', maxWidth: 430, margin: '0 auto' }}
      >
        <div className="app-content">
          <Routes>
            <Route path="/inventory" element={<InventoryScreen />} />
            <Route path="/bonus-games" element={<BonusGamesScreen />} />
            <Route
              path="*"
              element={
                <p>
                  Возврат на карту. <a href="/section-panoramas-qa.html">Открыть магазин</a>
                </p>
              }
            />
          </Routes>
        </div>
      </div>
    </MemoryRouter>
  </QueryClientProvider>,
);
