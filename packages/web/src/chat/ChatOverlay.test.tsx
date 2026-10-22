import { useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { ChatOverlay } from './ChatOverlay.js';
vi.mock('./screens/ChatListScreen.js', () => ({
  ChatListScreen: () => {
    const navigate = useNavigate();
    return <button onClick={() => navigate('/chat/one')}>Диалог</button>;
  },
}));
vi.mock('./screens/ChatRoomScreen.js', () => ({
  ChatRoomScreen: () => {
    const navigate = useNavigate();
    return (
      <>
        <p>Сообщения</p>
        <button onClick={() => navigate('/chat')}>Список</button>
      </>
    );
  },
}));
it('keeps the game mounted with its original route while browsing and closing chat', async () => {
  const unmount = vi.fn();
  function Game() {
    const location = useLocation(),
      navigate = useNavigate();
    useEffect(() => unmount, []);
    return (
      <>
        <output>{location.pathname + location.search}</output>
        <button onClick={() => navigate('/chat')}>Открыть</button>
      </>
    );
  }
  render(
    <MemoryRouter initialEntries={['/?view=daily']}>
      <ChatOverlay>
        <Game />
      </ChatOverlay>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText('Открыть'));
  await waitFor(() => expect(screen.getByRole('dialog', { name: 'Чат' })).toBeVisible());
  expect(screen.getByRole('dialog', {name:'Чат'}).parentElement).toHaveStyle({background:'rgba(0, 0, 0, 0.12)'});
  expect(screen.getByText('/?view=daily')).toBeInTheDocument();
  fireEvent.click(await screen.findByText('Диалог'));
  expect(await screen.findByText('Сообщения')).toBeVisible();
  expect(unmount).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Развернуть чат' }));
  expect(screen.getByRole('dialog')).toHaveClass('chat-overlay--expanded');
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть чат' }));
  expect(unmount).not.toHaveBeenCalled();
  expect(screen.getByText('/?view=daily')).toBeVisible();
});
it('leaves the map feed outside the chat overlay', () => {
  render(
    <MemoryRouter initialEntries={['/chat?view=feed']}>
      <ChatOverlay>
        <p>Лента</p>
      </ChatOverlay>
    </MemoryRouter>,
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByText('Лента')).toBeVisible();
});

it('resizes continuously with the handle, clamps to a third, and remembers after reopening', async () => {
  localStorage.clear();
  function Page() {
    const navigate = useNavigate();
    return <button onClick={() => navigate('/chat')}>Открыть</button>;
  }
  render(
    <MemoryRouter initialEntries={['/sections']}>
      <ChatOverlay owner="resize-test">
        <Page />
      </ChatOverlay>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText('Открыть'));
  const handle = await screen.findByRole('slider', { name: 'Высота чата' });
  const backdrop = handle.closest('[role="presentation"]')!;
  vi.spyOn(backdrop, 'getBoundingClientRect').mockReturnValue({ height: 900 } as DOMRect);
  vi.spyOn(screen.getByRole('dialog'), 'getBoundingClientRect').mockReturnValue({
    height: 495,
  } as DOMRect);
  fireEvent.pointerDown(handle, { pointerId: 1, isPrimary: true, button: 0, clientY: 400 });
  fireEvent.pointerMove(handle, { pointerId: 1, clientY: 220 });
  expect(screen.getByRole('dialog')).toHaveStyle({ height: '75%' });
  fireEvent.pointerUp(handle, { pointerId: 1, clientY: 220 });
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть чат' }));
  fireEvent.click(screen.getByText('Открыть'));
  expect(await screen.findByRole('slider', { name: 'Высота чата' })).toHaveAttribute(
    'aria-valuenow',
    '75',
  );
  fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' });
  expect(screen.getByRole('dialog')).toHaveStyle({ height: '100%' });
  fireEvent.click(screen.getByRole('button', { name: 'Свернуть чат' }));
  expect(screen.getByRole('dialog')).toHaveStyle({ height: '75%' });
  fireEvent.keyDown(screen.getByRole('slider'), { key: 'Home' });
  expect(parseFloat(screen.getByRole('dialog').style.height)).toBeCloseTo(100 / 3, 2);
});

it('keeps the booth chat tab outside the floating chat overlay', () => {
 render(<MemoryRouter initialEntries={['/chat?view=chat']}><ChatOverlay><p>Booth chat list</p></ChatOverlay></MemoryRouter>);
 expect(screen.queryByRole('dialog')).toBeNull();
 expect(screen.getByText('Booth chat list')).toBeVisible();
});
