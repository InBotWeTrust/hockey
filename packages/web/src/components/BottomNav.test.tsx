import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { BottomNav, ADMIN_NAV_HOME_EVENT } from './BottomNav.js';
import { useAuthStore } from '../auth/authStore.js';
import { useChatStore } from '../chat/chatStore.js';

function LocationProbe(): JSX.Element {
  const location = useLocation();
  return (
    <output aria-label="location">
      {location.pathname}
      {location.search}
      {location.hash}
    </output>
  );
}

function AdminHomeProbe(): JSX.Element {
  const [section, setSection] = useState('duels');
  useEffect(() => {
    const reset = (): void => setSection('dashboard');
    window.addEventListener(ADMIN_NAV_HOME_EVENT, reset);
    return () => window.removeEventListener(ADMIN_NAV_HOME_EVENT, reset);
  }, []);
  return <output aria-label="admin-section">{section}</output>;
}

function renderBottomNav(path: string, extra?: JSX.Element): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
        {extra}
        <BottomNav />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BottomNav remembered navigation', () => {
  const vibrate = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    Object.defineProperty(window.navigator, 'vibrate', { configurable: true, value: vibrate });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    useAuthStore.getState().clearSession();
    useChatStore.getState().setUnread({});
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: {
        id: 'u1',
        displayName: 'Egor',
        role: 'admin',
        experimentalTrainingCourt: false,
      },
    });
  });

  it('resets the active game section to the arena', () => {
    renderBottomNav('/?view=amateur&match=m1');

    fireEvent.click(screen.getByRole('button', { name: 'Игра' }));

    expect(screen.getByLabelText('location')).toHaveTextContent('/?view=arena');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('opens the arena from another section', () => {
    sessionStorage.setItem('hockey.nav.lastGameRoute', '/?view=training');
    renderBottomNav('/profile/settings');

    fireEvent.click(screen.getByRole('button', { name: 'Игра' }));

    expect(screen.getByLabelText('location')).toHaveTextContent('/?view=arena');
  });

  it('opens sections from the second tab', () => {
    renderBottomNav('/');

    fireEvent.click(screen.getByRole('button', { name: 'Разделы' }));

    expect(screen.getByLabelText('location')).toHaveTextContent('/sections');
  });

  it('opens the last remembered sections route from another tab', () => {
    sessionStorage.setItem('hockey.nav.lastSectionsRoute', '/?view=amateur&section=duels');
    renderBottomNav('/profile');

    fireEvent.click(screen.getByRole('button', { name: 'Разделы' }));

    expect(screen.getByLabelText('location')).toHaveTextContent('/?view=amateur&section=duels');
  });

  it('resets the active sections tab to the sections root', () => {
    renderBottomNav('/?view=amateur&section=duels');

    fireEvent.click(screen.getByRole('button', { name: 'Разделы' }));

    expect(screen.getByLabelText('location')).toHaveTextContent('/sections');
  });

  it('keeps section setup screens on the sections tab until play starts', () => {
    renderBottomNav('/?view=training&from=sections');

    const gameTab = screen.getByRole('button', { name: 'Игра' });
    const sectionsTab = screen.getByRole('button', { name: 'Разделы' });

    expect(gameTab).not.toHaveAttribute('aria-current');
    expect(sectionsTab).toHaveAttribute('aria-current', 'page');
    expect(sectionsTab).toHaveClass('bottom-nav__tab--active');
    expect(sectionsTab.querySelector('.bottom-nav__icon-wrap--active')).toBeInTheDocument();
    const navigation = screen.getByRole('navigation', { name: 'Навигация' });
    const activeGlow = navigation.querySelector('.bottom-nav__active-glow');
    expect(activeGlow).toBeInTheDocument();
    expect(activeGlow?.parentElement).toBe(navigation);
    expect(activeGlow).toHaveStyle({ transform: 'translateX(100%)' });
    expect(sectionsTab.querySelector('.bottom-nav__active-glow')).toBeNull();
    expect(gameTab.querySelector('.bottom-nav__icon-wrap--active')).toBeNull();
  });

  it('keeps amateur duel setup screens on the sections tab', () => {
    renderBottomNav('/?view=amateur&section=duels');

    const gameTab = screen.getByRole('button', { name: 'Игра' });
    const sectionsTab = screen.getByRole('button', { name: 'Разделы' });

    expect(gameTab).not.toHaveAttribute('aria-current');
    expect(sectionsTab).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the bonus games catalog on the sections tab', () => {
    renderBottomNav('/bonus-games');

    const gameTab = screen.getByRole('button', { name: 'Игра' });
    const sectionsTab = screen.getByRole('button', { name: 'Разделы' });

    expect(gameTab).not.toHaveAttribute('aria-current');
    expect(sectionsTab).toHaveAttribute('aria-current', 'page');
  });

  it('hides the dock inside an active bonus game rink', () => {
    renderBottomNav('/bonus-games/00000000-0000-4000-8000-000000000601/play?attempt=attempt-id');

    expect(screen.queryByRole('button', { name: 'Игра' })).toBeNull();
  });

  it('hides the dock on the open rink screen', () => {
    renderBottomNav('/?view=training&play=1');

    expect(screen.queryByRole('button', { name: 'Игра' })).toBeNull();
  });

  it('hides the dock inside a classic tournament game', () => {
    renderBottomNav('/?view=classic&tournament=t1');

    expect(screen.queryByRole('button', { name: 'Игра' })).toBeNull();
  });

  it('hides the dock on the demo rink', () => {
    renderBottomNav('/demo');

    expect(screen.queryByRole('navigation', { name: 'Демо-навигация' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Игра' })).toBeNull();
  });

  it('shows a game badge only for actionable duel events', async () => {
    vi.mocked(globalThis.fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/duel/amateur/events')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              events: [
                {
                  id: 'incoming',
                  status: 'invited',
                  starts_at: '2026-05-29T10:00:00.000Z',
                  ends_at: '2026-05-29T11:00:00.000Z',
                  server_now: '2026-05-29T10:00:00.000Z',
                  me: { side: 'opponent', state: 'invited' },
                  opponent: { state: 'invited' },
                },
                {
                  id: 'waiting',
                  status: 'invited',
                  starts_at: '2026-05-29T10:00:00.000Z',
                  ends_at: '2026-05-29T11:00:00.000Z',
                  server_now: '2026-05-29T10:00:00.000Z',
                  me: { side: 'challenger', state: 'invited' },
                  opponent: { state: 'invited' },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    renderBottomNav('/profile');

    expect(await screen.findByLabelText('События игры: 1')).toHaveTextContent('1');
  });

  it('adds unfinished classic tournament games to the game badge', async () => {
    vi.mocked(globalThis.fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/duel/amateur/events')) {
        return Promise.resolve(
          new Response(JSON.stringify({ events: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      if (url.endsWith('/api/tournaments/classic/active')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              games: [
                { tournament_id: 'available', state: 'available' },
                { tournament_id: 'started', state: 'period_active' },
                { tournament_id: 'completed', state: 'closed' },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    renderBottomNav('/profile');

    expect(await screen.findByLabelText('События игры: 2')).toHaveTextContent('2');
  });

  it('counts an inter-game playoff break but not a completed playoff day in the game badge', async () => {
    vi.mocked(globalThis.fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/duel/amateur/events')) {
        return Promise.resolve(
          new Response(JSON.stringify({ events: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      if (url.endsWith('/api/tournaments/classic/active')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              games: [
                { tournament_id: 'break', kind: 'playoff', state: 'inter_game_break' },
                { tournament_id: 'done', kind: 'playoff', state: 'completed' },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    renderBottomNav('/profile');

    expect(await screen.findByLabelText('События игры: 1')).toHaveTextContent('1');
  });

  it('renders every notification badge above its navigation icon', async () => {
    vi.mocked(globalThis.fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/duel/amateur/events')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              events: [
                {
                  id: 'incoming',
                  status: 'invited',
                  starts_at: '2026-05-29T10:00:00.000Z',
                  ends_at: '2026-05-29T11:00:00.000Z',
                  server_now: '2026-05-29T10:00:00.000Z',
                  me: { side: 'opponent', state: 'invited' },
                  opponent: { state: 'invited' },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      if (url.endsWith('/api/weekly-challenge/current')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              challenge: { id: 'challenge-1', title: 'Новый челлендж', canJoin: true },
              pendingRewards: [],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
    useChatStore.getState().setUnread({ 'chat-1': 3 });

    renderBottomNav('/profile');

    const badges = await Promise.all([
      screen.findByLabelText('События игры: 1'),
      screen.findByLabelText('События разделов: 1'),
      screen.findByLabelText('Непрочитанные: 1'),
    ]);
    for (const badge of badges) {
      expect(badge.parentElement?.querySelector('svg')).not.toBeNull();
      expect(Number.parseInt(badge.style.zIndex, 10)).toBeGreaterThan(1);
    }
  });

  it('shows a sections badge when a weekly challenge needs joining', async () => {
    vi.mocked(globalThis.fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/weekly-challenge/current')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              challenge: {
                id: 'challenge-1',
                title: 'Неделя снайпера',
                canJoin: true,
              },
              pendingRewards: [],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    renderBottomNav('/profile');

    expect(await screen.findByLabelText('События разделов: 1')).toHaveTextContent('1');
  });

  it('shows a sections badge when a weekly challenge reward can be claimed', async () => {
    vi.mocked(globalThis.fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/weekly-challenge/current')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              challenge: {
                id: 'challenge-1',
                title: 'Неделя снайпера',
                canJoin: false,
                canClaimReward: true,
              },
              pendingRewards: [],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    renderBottomNav('/profile');

    expect(await screen.findByLabelText('События разделов: 1')).toHaveTextContent('1');
  });

  it('adds pending weekly challenge rewards to the sections badge', async () => {
    vi.mocked(globalThis.fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/weekly-challenge/current')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              challenge: {
                id: 'challenge-1',
                title: 'Новый челлендж',
                canJoin: true,
                canClaimReward: false,
              },
              pendingRewards: [
                {
                  id: 'challenge-old',
                  title: 'Прошлая неделя',
                  canClaimReward: true,
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    renderBottomNav('/profile');

    expect(await screen.findByLabelText('События разделов: 2')).toHaveTextContent('2');
  });

  it('combines achievement rewards and weekly challenge actions in the sections badge', async () => {
    vi.mocked(globalThis.fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/weekly-challenge/current')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              challenge: {
                id: 'challenge-1',
                title: 'Новый челлендж',
                canJoin: true,
                canClaimReward: false,
              },
              pendingRewards: [
                {
                  id: 'challenge-old',
                  title: 'Прошлая неделя',
                  canClaimReward: true,
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      if (url.endsWith('/api/achievements')) {
        return Promise.resolve(
          new Response(JSON.stringify({ achievements: [], unclaimedCount: 2 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    renderBottomNav('/profile');

    expect(await screen.findByLabelText('События разделов: 4')).toHaveTextContent('4');
  });

  it('refreshes missing grip for persisted auth sessions', async () => {
    vi.mocked(globalThis.fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/me')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: 'u1',
              displayName: 'Egor',
              role: 'admin',
              grip: 'right',
              experimentalTrainingCourt: false,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    renderBottomNav('/');

    await waitFor(() => expect(useAuthStore.getState().user?.grip).toBe('right'));
  });

  it('opens the last remembered profile route from another tab', () => {
    sessionStorage.setItem('hockey.nav.lastProfileRoute', '/profile/settings');
    renderBottomNav('/sections');

    fireEvent.click(screen.getByRole('button', { name: 'Раздевалка' }));

    expect(screen.getByLabelText('location')).toHaveTextContent('/profile/settings');
  });

  it('resets the active profile tab to the profile root', () => {
    renderBottomNav('/profile/settings');

    fireEvent.click(screen.getByRole('button', { name: 'Раздевалка' }));

    expect(screen.getByLabelText('location')).toHaveTextContent('/profile');
  });

  it('resets the active chat section to the chat list', () => {
    renderBottomNav('/chat?new=1');

    fireEvent.click(screen.getByRole('button', { name: 'Чат' }));

    expect(screen.getByLabelText('location')).toHaveTextContent('/chat');
  });

  it('notifies the admin screen to return to dashboard when admin tab is tapped again', () => {
    renderBottomNav('/admin', <AdminHomeProbe />);

    fireEvent.click(screen.getByRole('button', { name: 'Админ' }));

    expect(screen.getByLabelText('admin-section')).toHaveTextContent('dashboard');
  });
});
