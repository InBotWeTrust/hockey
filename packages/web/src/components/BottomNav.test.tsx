import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { BottomNav, ADMIN_NAV_HOME_EVENT } from './BottomNav.js';
import { useAuthStore } from '../auth/authStore.js';

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
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    useAuthStore.getState().clearSession();
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

  it('keeps section setup screens on the sections tab until play starts', () => {
    renderBottomNav('/?view=training&from=sections');

    const gameSurface = screen.getByRole('button', { name: 'Игра' }).querySelector('div');
    const sectionsSurface = screen.getByRole('button', { name: 'Разделы' }).querySelector('div');

    expect(gameSurface?.getAttribute('style')).toContain('rgba(255, 255, 255, 0.55)');
    expect(sectionsSurface?.getAttribute('style')).toContain('rgba(15, 23, 42, 0.92)');
  });

  it('hides the dock on the open rink screen', () => {
    renderBottomNav('/?view=training&play=1');

    expect(screen.queryByRole('button', { name: 'Игра' })).toBeNull();
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
