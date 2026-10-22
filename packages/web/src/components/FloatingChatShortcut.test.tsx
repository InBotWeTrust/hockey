import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { FloatingChatShortcut, isChatShortcutVisible } from './FloatingChatShortcut.js';
afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});
function Location() {
  const location = useLocation();
  return <output>{location.pathname + location.search}</output>;
}
it('keeps chat available throughout gameplay but hides it on auth and chat routes', () => {
  for (const route of [
    '/sections',
    '/bar',
    '/?view=daily',
    '/?view=training&play=1',
    '/duel/123',
    '/bar/games/match/123',
    '/bar/cards/computer/maria',
    '/bonus-games/123/play',
  ])
    expect(isChatShortcutVisible(new URL(route, 'http://local'))).toBe(true);
  for (const route of ['/chat', '/chat?view=feed', '/chat?view=chat', '/chat/123', '/login', '/auth/vk/callback'])
    expect(isChatShortcutVisible(new URL(route, 'http://local'))).toBe(false);
});
it('opens the chat list and preserves the source location for the overlay', () => {
  render(
    <MemoryRouter initialEntries={['/inventory?tab=history']}>
      <FloatingChatShortcut owner="one" unreadCount={7} />
      <Location />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }));
  expect(screen.getByText('/chat')).toBeVisible();
});
it('dims gameplay with a red unread badge capped at 99+', () => {
  render(
    <MemoryRouter initialEntries={['/?view=daily']}>
      <FloatingChatShortcut owner="one" unreadCount={120} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('button', { name: 'Открыть чат' })).toHaveClass('floating-chat--playing');
  expect(screen.getByLabelText('Непрочитанные: 120')).toHaveTextContent('99+');
});
it('drags without opening chat, persists the position, and clamps it after resizing', () => {
  const rect = {
    left: 0,
    top: 0,
    width: 390,
    height: 844,
    right: 390,
    bottom: 844,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect);
  const app = (
    <MemoryRouter initialEntries={['/sections']}>
      <div className="app-shell">
        <FloatingChatShortcut owner="one" unreadCount={0} />
        <Location />
      </div>
    </MemoryRouter>
  );
  const view = render(app);
  const button = screen.getByRole('button', { name: 'Открыть чат' });
  fireEvent.pointerDown(button, {
    pointerId: 1,
    isPrimary: true,
    button: 0,
    clientX: 350,
    clientY: 700,
  });
  fireEvent.pointerMove(button, { pointerId: 1, isPrimary: true, clientX: 150, clientY: 300 });
  fireEvent.pointerUp(button, { pointerId: 1, isPrimary: true, clientX: 150, clientY: 300 });
  fireEvent.click(button, { detail: 1 });
  expect(screen.getByText('/sections')).toBeVisible();
  expect(button.style.left).not.toBe('');
  const saved = button.style.left;
  view.unmount();
  render(app);
  expect(screen.getByRole('button', { name: 'Открыть чат' }).style.left).toBe(saved);
  rect.width = 100;
  rect.height = 100;
  fireEvent(window, new Event('resize'));
  expect(
    parseFloat(screen.getByRole('button', { name: 'Открыть чат' }).style.left),
  ).toBeLessThanOrEqual(48);
});

it('still lets the existing side preference move a previously dragged shortcut', async () => {
  const { setMapChatPosition } = await import('../app/mapChatPosition.js');
  const { act } = await import('@testing-library/react');
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 390,
    height: 844,
  } as DOMRect);
  localStorage.setItem('floating-chat-position-v2:one', JSON.stringify({ x: 150, y: 200 }));
  render(
    <MemoryRouter initialEntries={['/sections']}>
      <div className="app-shell">
        <FloatingChatShortcut owner="one" unreadCount={0} />
      </div>
    </MemoryRouter>,
  );
  act(() => setMapChatPosition('one', 'left'));
  expect(screen.getByRole('button', { name: 'Открыть чат' }).style.left).toBe('12px');
});
