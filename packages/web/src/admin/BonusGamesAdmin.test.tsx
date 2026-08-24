import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/authStore.js';
import { AdminScreen } from './AdminScreen.js';

const bonusGame = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'beach',
  title: 'Пляжный хоккей',
  description: 'Забейте 18 голов на пляже.',
  sortOrder: 1,
  status: 'active',
  accessType: 'paid',
  unlockPriceStars: 5,
  targetGoals: 18,
  totalPeriods: 1,
  breakDurationMs: 30_000,
  periods: [
    {
      periodNumber: 1,
      durationMs: 240_000,
      shotsLimit: 30,
      goalFrequency: 0.45,
      goalieFrequency: 0.5,
      shooterFrequency: 0.65,
      puckSpeedPerMs: 1.2,
      goaliePattern: 'linear',
      goalieAmplitude: 1,
      goalAmplitude: 220,
    },
  ],
  rewardCoins: 100,
  rewardStars: 1,
  rewardExperience: 50,
  goalkeeperReadyUrl: '/bonus-games/goalkeepers/beach-ready.webp',
  goalkeeperSaveUrl: '/bonus-games/goalkeepers/beach-save.webp',
  revision: 1,
  createdBy: 'admin',
  createdAt: '2026-08-23T10:00:00.000Z',
  updatedAt: '2026-08-23T10:00:00.000Z',
  archivedAt: null,
  arena: {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'beach-arena',
    title: 'Пляж',
    artworkUrl: '/bonus-games/arenas/beach.webp',
    thumbnailUrl: '/bonus-games/arenas/beach.webp',
    status: 'active',
    isSelectable: true,
  },
};

function renderAdmin(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AdminScreen />
    </QueryClientProvider>,
  );
}

describe('bonus games admin', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
    useAuthStore.getState().setSession({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: { id: 'admin', displayName: 'Администратор', role: 'admin' },
    });
    vi.restoreAllMocks();
  });

  it('fetches the bonus catalog only on its tab and exposes the complete editor and archive copy', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/admin/bonus-games')) {
        return new Response(JSON.stringify({ games: [bonusGame] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/admin/users')) {
        return new Response(JSON.stringify({ users: [], total: 0, limit: 20, offset: 0 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/admin/feedback')) {
        return new Response(
          JSON.stringify({
            feedback: [],
            total: 0,
            unreadCount: 0,
            ratingStats: { count: 0, average: null },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });

    renderAdmin();

    expect(screen.getByRole('button', { name: 'Бонусные игры' })).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('/admin/bonus-games')),
    ).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Бонусные игры' }));

    expect(await screen.findByText('Пляжный хоккей')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => String(input).includes('/admin/bonus-games')),
      ).toBe(true);
    });
    expect(screen.getByRole('img', { name: 'Площадка «Пляж»' })).toHaveAttribute(
      'src',
      '/bonus-games/arenas/beach.webp',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Редактировать Пляжный хоккей' }));
    const editor = await screen.findByRole('dialog', { name: 'Редактирование бонусной игры' });
    for (const label of [
      'Название',
      'Описание',
      'Порядок',
      'Статус',
      'Доступ',
      'Цена в звёздах',
      'Цель по голам',
      'Периодов',
      'Перерыв, мс',
      'Частота ворот',
      'Частота вратаря',
      'Частота игрока',
      'Скорость шайбы',
      'Паттерн вратаря',
      'Амплитуда вратаря',
      'Амплитуда ворот',
      'Награда: монеты',
      'Награда: звёзды',
      'Награда: опыт',
      'Фон площадки',
      'Миниатюра площадки',
      'Вратарь: готов',
      'Вратарь: сейв',
    ]) {
      expect(within(editor).getByLabelText(label)).toBeInTheDocument();
    }

    fireEvent.click(within(editor).getByRole('button', { name: 'Отмена' }));
    fireEvent.click(screen.getByRole('button', { name: 'Архивировать Пляжный хоккей' }));
    const archive = await screen.findByRole('dialog', { name: 'Архивировать бонусную игру' });
    expect(
      within(archive).getByText(
        'Новые попытки станут недоступны. Активные попытки продолжатся по сохранённым снимкам правил.',
      ),
    ).toBeInTheDocument();
  });
});
