import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileScreen } from './ProfileScreen.js';
import { useAuthStore } from '../auth/authStore.js';

const profile = {
  id: 'u1',
  displayName: 'Alice T',
  registeredAt: '2026-08-14T12:00:00.000Z',
  avatarUrl: 'avatar.png',
  role: 'player',
  grip: 'right' as const,
  competitionLevel: 'beginner' as const,
  stats: { shots: 128, goals: 64, accuracy: 50, playStreakDays: 7, bestPlayStreakDays: 12 },
  achievements: [
    {
      id: 'a1',
      photoUrl: '/achievement-1.webp',
      title: 'Снайпер недели',
      description: 'Лучший результат',
      requirement: 'Забить 50 голов',
      isUnlocked: true,
      status: 'claimed' as const,
    },
  ],
  trophySummary: {
    regularSeasonWins: 4,
    tournamentChampionships: 2,
    tournamentPodiums: 5,
    completedChallenges: 11,
  },
  currencyBalance: 1000,
  starBalance: 3,
  experienceBalance: 77,
};

function mockProfileRequest(
  status = 200,
  response: Omit<typeof profile, 'currencyBalance' | 'starBalance' | 'experienceBalance'> &
    Partial<
      Pick<typeof profile, 'currencyBalance' | 'starBalance' | 'experienceBalance'>
    > = profile,
): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/api/me')) {
      return new Response(status === 200 ? JSON.stringify(response) : 'server error', {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.endsWith('/api/inventory/me')) {
      return new Response(
        JSON.stringify({
          balances: { tokens: 1000, stars: 3, experience: 77 },
          items: {
            stick: [
              {
                id: 'stick-1',
                kind: 'stick',
                title: 'Ледяной клинок',
                imageUrl: '/stick.webp',
                resourceUnit: 'shot',
                chargesAvailable: 18,
              },
              {
                id: 'stick-2',
                kind: 'stick',
                title: 'Закончившаяся клюшка',
                imageUrl: '/empty-stick.webp',
                chargesAvailable: 0,
              },
            ],
            skates: [
              {
                id: 'skates-1',
                kind: 'skates',
                title: 'Северный ход',
                imageUrl: '/skates.webp',
                resourceUnit: 'distance',
                chargesAvailable: 7,
              },
            ],
            nutrition: [
              {
                id: 'food-1',
                kind: 'nutrition',
                title: 'Энерго-гель',
                imageUrl: '/food.webp',
                resourceUnit: 'energy_ms',
                chargesAvailable: 180_000,
              },
            ],
          },
          equipped: { stickItemId: 'stick-1', skatesItemId: 'skates-1', nutritionItemId: 'food-1' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.endsWith('/api/me/home-arenas')) {
      return new Response(
        JSON.stringify({
          arenas: [],
          selected_arena: {
            id: 'default',
            selection_id: null,
            slug: 'polar',
            title: 'Полярная ночь',
            artwork_url: '/arena.webp',
            thumbnail_url: '/arena-thumb.webp',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('not found', { status: 404 });
  });
}

function renderProfile(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<ProfileScreen />} />
          <Route path="/profile/stats" element={<div>stats screen</div>} />
          <Route path="/profile/equipment" element={<div>equipment screen</div>} />
          <Route path="/profile/achievements" element={<div>achievements screen</div>} />
          <Route path="/profile/settings" element={<div>settings screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProfileScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().setSession({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: { id: 'u1', displayName: 'Alice T' },
    });
  });

  it('renders a direct profile hub instead of the locker hotspots', async () => {
    mockProfileRequest();

    renderProfile();

    expect(await screen.findByLabelText('Спортивный паспорт')).toBeInTheDocument();
    expect(screen.queryByText('Всё по делу')).not.toBeInTheDocument();
    expect(screen.getByText('Alice T')).toBeInTheDocument();
    expect(screen.getByText('Новичок')).toBeInTheDocument();
    expect(screen.getByLabelText('Монеты: 1000')).toBeInTheDocument();
    expect(screen.getByLabelText('Звёзды: 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Опыт: 77')).toBeInTheDocument();
    expect(screen.getByTestId('profile-balance-icon-coins')).toBeInTheDocument();
    expect(screen.getByTestId('profile-balance-icon-stars')).toBeInTheDocument();
    expect(screen.getByTestId('profile-balance-icon-experience')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Статистика' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Открыть инвентарь' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Открыть инвентарь' })).toHaveClass(
      'profile-section-label',
    );
    expect(screen.queryByRole('button', { name: 'Домашняя арена' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Открыть карьеру и награды' })).toBeInTheDocument();
    expect(screen.getByText('Награды и достижения (1)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Настройки' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Раздевалка игрока')).not.toBeInTheDocument();
  });

  it('routes each direct profile card to its destination', async () => {
    mockProfileRequest();

    renderProfile();

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть инвентарь' }));
    expect(screen.getByText('equipment screen')).toBeInTheDocument();
  });

  it('opens the matching equipment picker from an equipped item', async () => {
    mockProfileRequest();
    renderProfile();

    fireEvent.click(await screen.findByRole('button', { name: 'Выбрать клюшку' }));

    const dialog = screen.getByRole('dialog', { name: 'Выбрать клюшку' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Выбрать Обычная клюшка' })).toBeEnabled();
    expect(within(dialog).getByText('Ледяной клинок')).toBeInTheDocument();
    expect(within(dialog).getByText('Осталось: 18 бросков')).toBeInTheDocument();
    expect(within(dialog).queryByText('Закончившаяся клюшка')).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Закрыть' }));
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать коньки' }));
    expect(
      within(screen.getByRole('dialog', { name: 'Выбрать коньки' })).getByText(
        'Осталось: 7 прокатов',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать питание' }));
    expect(
      within(screen.getByRole('dialog', { name: 'Выбрать питание' })).getByText(
        'Осталось: 3 минуты энергии',
      ),
    ).toBeInTheDocument();
  });

  it('opens achievement details from a career award', async () => {
    mockProfileRequest();
    renderProfile();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Открыть достижение Снайпер недели' }),
    );

    expect(screen.getByRole('dialog', { name: 'Снайпер недели' })).toBeInTheDocument();
    expect(screen.getByText('Лучший результат')).toBeInTheDocument();
    expect(screen.getByText('Забить 50 голов')).toBeInTheDocument();
  });

  it('uses equipment, career and compact utility actions instead of a card catalog', async () => {
    mockProfileRequest();

    renderProfile();

    const cards = await screen.findByLabelText('Спортивные данные игрока');
    const cardButtons = Array.from(cards.querySelectorAll<HTMLButtonElement>('button'));
    expect(cardButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Открыть инвентарь',
      'Выбрать клюшку',
      'Выбрать коньки',
      'Выбрать питание',
      'Открыть карьеру и награды',
      'Открыть достижение Снайпер недели',
      'Настройки',
    ]);
  });

  it('shows the player trophy showcase under the identity card', async () => {
    mockProfileRequest();
    renderProfile();

    const showcase = await screen.findByLabelText('Витрина наград');
    const passport = screen.getByLabelText('Спортивный паспорт');
    expect(passport).toContainElement(showcase);
    expect(showcase).toHaveTextContent('4Победы в регулярке');
    expect(showcase).toHaveTextContent('2Чемпионства');
    expect(showcase).toHaveTextContent('5Призовые места');
    expect(showcase).toHaveTextContent('11Челленджи');
  });

  it('shows the key sporting metrics inside one passport card', async () => {
    mockProfileRequest();
    renderProfile();

    const passport = await screen.findByLabelText('Спортивный паспорт');
    expect(passport).toHaveTextContent('64Голы');
    expect(passport).toHaveTextContent('50%Точность');
    expect(passport).toHaveTextContent('7 (12)Дней подряд');
    expect(passport).toHaveTextContent('с 14.08.2026В игре');
    expect(passport.querySelector('.profile-streak-record')).toHaveTextContent('(12)');
    expect(passport.querySelector('.profile-registration-date')).toHaveTextContent('с 14.08.2026');
    expect(passport.querySelector('.profile-registration-date__prefix')).toHaveTextContent('с');
    expect(screen.queryByLabelText('Профиль игрока')).not.toBeInTheDocument();
  });

  it('shows three visual equipment slots with selected items and remaining charges', async () => {
    mockProfileRequest();
    renderProfile();

    const equipmentCard = await screen.findByLabelText('Активная экипировка');
    expect(equipmentCard).toHaveTextContent('18КлюшкаЛедяной клинок');
    expect(equipmentCard).toHaveTextContent('7КонькиСеверный ход');
    expect(equipmentCard).toHaveTextContent('180 000ПитаниеЭнерго-гель');
    expect(screen.getByRole('img', { name: 'Ледяной клинок' })).toHaveAttribute(
      'src',
      '/stick.webp',
    );
    expect(screen.getByRole('img', { name: 'Северный ход' })).toHaveAttribute(
      'src',
      '/skates.webp',
    );
    expect(screen.getByRole('img', { name: 'Энерго-гель' })).toHaveAttribute('src', '/food.webp');
  });

  it('shows the latest earned achievement in the career band', async () => {
    mockProfileRequest();
    renderProfile();

    const career = await screen.findByLabelText('Награды и достижения');
    expect(career).toHaveTextContent('Снайпер недели');
    expect(career.querySelector('img')).toHaveAttribute('src', '/achievement-1.webp');
    expect(career.querySelector('.profile-career-list')).toHaveClass('profile-career-list--scroll');
  });

  it('uses the shared glass surface treatment for the new profile sections', async () => {
    mockProfileRequest();

    renderProfile();

    const profileCard = await screen.findByLabelText('Активная экипировка');
    expect(profileCard.querySelector('.profile-equipment-panel')).toHaveClass('glass');
    expect(profileCard).not.toHaveClass('section-card-surface');
  });

  it('shows a retryable profile error instead of fabricated balances', async () => {
    mockProfileRequest(500);

    renderProfile();

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить профиль');
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Монеты:/)).not.toBeInTheDocument();
  });

  it('does not substitute zero balances when the profile response is incomplete', async () => {
    const { currencyBalance, starBalance, experienceBalance, ...incompleteProfile } = profile;
    void currencyBalance;
    void starBalance;
    void experienceBalance;
    mockProfileRequest(200, incompleteProfile);

    renderProfile();

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить профиль');
    expect(screen.queryByLabelText(/Монеты:/)).not.toBeInTheDocument();
  });
});
