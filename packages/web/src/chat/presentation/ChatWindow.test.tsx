import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { ChatWindow } from './ChatWindow.js';
import { useChatWindowStore } from './chatWindowStore.js';
const flags = vi.hoisted(() => ({ recording: false }));
vi.mock('../screens/ChatListScreen.js', () => ({
  ChatListScreen: () => (
    <>
      <p>Chat list</p>
      {flags.recording && <textarea data-voice-recording="true" />}
    </>
  ),
}));
vi.mock('../screens/ChatRoomScreen.js', () => ({ ChatRoomScreen: () => <p>Chat room</p> }));
vi.mock('../screens/ChatInfoScreen.js', () => ({ ChatInfoScreen: () => <p>Chat info</p> }));
vi.mock('../screens/ChannelPostCommentsScreen.js', () => ({
  ChannelPostCommentsScreen: () => <p>Comments</p>,
}));
function Probe() {
  const location = useLocation();
  return <output>{location.pathname}</output>;
}
beforeEach(() => {
  flags.recording = false;
  localStorage.clear();
  useChatWindowStore.getState().setOwner(null);
  useChatWindowStore.getState().setOwner('a');
});
it('opens and docks without replacing the main venue route', async () => {
  useChatWindowStore.getState().open();
  render(
    <MemoryRouter initialEntries={['/daily']}>
      <Probe />
      <ChatWindow owner="a" gameplay={false} />
    </MemoryRouter>,
  );
  expect(await screen.findByText('Chat list')).toBeVisible();
  expect(screen.getByText('/daily')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Закрепить чат' }));
  expect(useChatWindowStore.getState().mode).toBe('docked');
  fireEvent.click(screen.getByRole('button', { name: 'Свернуть чат' }));
  expect(screen.getByText('Chat list')).not.toBeVisible();
  expect(useChatWindowStore.getState().mode).toBe('minimized');
});
it('hides the open chat during gameplay and restores it on return', async () => {
  useChatWindowStore.getState().open();
  const view = render(
    <MemoryRouter>
      <ChatWindow owner="a" gameplay={false} />
    </MemoryRouter>,
  );
  expect(await screen.findByText('Chat list')).toBeVisible();
  view.rerender(
    <MemoryRouter>
      <ChatWindow owner="a" gameplay />
    </MemoryRouter>,
  );
  expect(screen.getByText('Chat list')).not.toBeVisible();
  view.rerender(
    <MemoryRouter>
      <ChatWindow owner="a" gameplay={false} />
    </MemoryRouter>,
  );
  expect(screen.getByText('Chat list')).toBeVisible();
});
it('supports keyboard move and resize and switches to full-page chat below the breakpoint', async () => {
  const originalWidth = window.innerWidth;
  useChatWindowStore.getState().open();
  render(
    <MemoryRouter initialEntries={['/daily']}>
      <Probe />
      <ChatWindow owner="a" gameplay={false} />
    </MemoryRouter>,
  );
  await screen.findByText('Chat list');
  const before = useChatWindowStore.getState().rect;
  fireEvent.keyDown(screen.getByRole('button', { name: 'Переместить окно чата' }), {
    key: 'ArrowRight',
  });
  expect(useChatWindowStore.getState().rect.x).toBe(before.x + 16);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Изменить размер чата' }), {
    key: 'ArrowRight',
  });
  expect(useChatWindowStore.getState().rect.width).toBe(before.width + 16);
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 831 });
  fireEvent(window, new Event('resize'));
  expect(screen.getByText('/chat')).toBeVisible();
  expect(useChatWindowStore.getState().mode).toBe('minimized');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
});
it('ignores corrupt saved geometry and does not carry locations across users', () => {
  localStorage.setItem(
    'chat-window-v1:b',
    JSON.stringify({ mode: 'floating', rect: { x: 'bad' } }),
  );
  useChatWindowStore.getState().setLocation({ pathname: '/chat/private', search: '', hash: '' });
  useChatWindowStore.getState().setOwner('b');
  expect(useChatWindowStore.getState().mode).toBe('closed');
  expect(useChatWindowStore.getState().location.pathname).toBe('/chat');
});

it('confirms recording cancellation before minimizing', async () => {
  flags.recording = true;
  useChatWindowStore.getState().open();
  const cancel = vi.fn();
  window.addEventListener('hockey:chat-window-cancel-voice', cancel);
  render(
    <MemoryRouter>
      <ChatWindow owner="a" gameplay={false} />
    </MemoryRouter>,
  );
  await screen.findByText('Chat list');
  fireEvent.click(screen.getByRole('button', { name: 'Свернуть чат' }));
  expect(useChatWindowStore.getState().mode).toBe('floating');
  fireEvent.click(screen.getByRole('button', { name: 'Свернуть чат' }));
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(useChatWindowStore.getState().mode).toBe('minimized');
  window.removeEventListener('hockey:chat-window-cancel-voice', cancel);
});
