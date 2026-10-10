import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { it, expect, vi, afterEach } from 'vitest';
import { OnlineDurakLobby } from './OnlineDurakLobby.js';
import * as api from './onlineApi.js';
import * as rooms from './roomApi.js';
vi.mock('./roomApi.js', () => ({ joinRoom: vi.fn(), roomInvite: vi.fn() }));
vi.mock('./onlineApi.js', () => ({
  lobby: vi.fn(),
  queue: vi.fn(),
  invite: vi.fn(),
  respond: vi.fn(),
  searchPlayers: vi.fn(),
}));
vi.mocked(api.searchPlayers).mockResolvedValue([]);
const showOnline = () => fireEvent.click(screen.getByRole('tab', { name: /^Игра онлайн/ }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});
it('shows the empty state only when no pending invitations are displayed', async () => {
  vi.useFakeTimers();
  const invitation: api.Invite = {
    id: 'incoming',
    sender_id: 'other',
    receiver_id: 'player',
    sender_name: 'Александр',
    receiver_name: 'Игрок',
    status: 'pending',
    match_id: null,
    expires_at: '2099-01-01T00:00:00Z',
  };
  vi.mocked(api.lobby).mockResolvedValue({
    matchId: null,
    searching: false,
    invites: [invitation],
  });
  render(
    <MemoryRouter>
      <OnlineDurakLobby />
    </MemoryRouter>,
  );
  await act(async () => {});
  showOnline();
  expect(screen.getByRole('button', { name: 'Принять' })).toBeInTheDocument();
  expect(screen.queryByText('Активных партий пока нет')).not.toBeInTheDocument();
  vi.mocked(api.lobby).mockResolvedValue({
    matchId: null,
    searching: false,
    invites: [{ ...invitation, status: 'declined' }],
  });
  await act(async () => {
    vi.advanceTimersByTime(2000);
  });
  expect(screen.getByText('Активных партий пока нет')).toBeInTheDocument();
});

it('opens the selected table format and ignores an older lobby response', async () => {
  vi.useFakeTimers();
  const idle = { matchId: null, searching: false, invites: [] };
  let stale!: (state: api.Lobby) => void;
  vi.mocked(api.lobby)
    .mockResolvedValueOnce(idle)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          stale = resolve;
        }),
    )
    .mockResolvedValue({ ...idle, searching: true });
  vi.mocked(rooms.joinRoom).mockResolvedValue({ roomId: 'five' });
  render(
    <MemoryRouter initialEntries={['/lobby']}>
      <Routes>
        <Route path="/lobby" element={<OnlineDurakLobby />} />
        <Route path="/bar/cards/room/five" element={<h1>Стол на пятерых</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
  showOnline();
  await act(async () => {
    vi.advanceTimersByTime(2000);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    fireEvent.click(screen.getByRole('button', { name: '2' }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Начать поиск' }));
  });
  expect(screen.getByText('Стол на пятерых')).toBeInTheDocument();
  expect(rooms.joinRoom).toHaveBeenCalledWith([5]);
  await act(async () => {
    stale(idle);
  });
  expect(screen.getByText('Стол на пятерых')).toBeInTheDocument();
});

it('keeps several search formats selected and sends all of them', async () => {
  vi.mocked(api.lobby).mockResolvedValue({ matchId: null, searching: false, invites: [] });
  vi.mocked(rooms.joinRoom).mockResolvedValue({ roomId: 'any' });
  render(
    <MemoryRouter>
      <OnlineDurakLobby />
    </MemoryRouter>,
  );
  await act(async () => {});
  showOnline();
  fireEvent.click(screen.getByRole('button', { name: '4' }));
  fireEvent.click(screen.getByRole('button', { name: '6' }));
  for (const n of ['2', '4', '6'])
    expect(screen.getByRole('button', { name: n })).toHaveAttribute('aria-pressed', 'true');
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Начать поиск' }));
  });
  expect(rooms.joinRoom).toHaveBeenCalledWith([2, 4, 6]);
});

it('offers Maria through the existing launch modal', async () => {
  vi.mocked(api.lobby).mockResolvedValue({ matchId: null, searching: false, invites: [] });
  render(
    <MemoryRouter>
      <OnlineDurakLobby />
    </MemoryRouter>,
  );
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Следующий персонаж' }));
  fireEvent.click(screen.getByRole('button', { name: 'Следующий персонаж' }));
  fireEvent.click(screen.getByRole('button', { name: 'Сыграть с Марией' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Дурак с Марией');
  expect(screen.getByRole('button', { name: 'Играть' })).toBeInTheDocument();
});

it('offers quick selection and a clear empty search result', async () => {
  vi.useFakeTimers();
  vi.mocked(api.lobby).mockResolvedValue({ matchId: null, searching: false, invites: [] });
  vi.mocked(api.searchPlayers).mockImplementation(async (q) =>
    q ? [] : [{ userId: 'other', displayName: 'Александр', avatarUrl: null }],
  );
  render(
    <MemoryRouter>
      <OnlineDurakLobby />
    </MemoryRouter>,
  );
  await act(async () => {});
  showOnline();
  fireEvent.click(screen.getByRole('tab', { name: 'Вызвать' }));
  await act(async () => {});
  expect(screen.getByRole('button', { name: 'Выбрать соперника Александр' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Имя соперника' }), {
    target: { value: 'нет' },
  });
  await act(async () => {
    vi.advanceTimersByTime(300);
  });
  expect(screen.getByText('Игроки не найдены')).toBeInTheDocument();
});

it.each([
  ['Дарьей', 'Дарья'],
  ['Григорием', 'Григорий'],
  ['Арсеничем', 'Арсенич'],
])('opens the launch for %s with their own description', async (name, character) => {
  vi.mocked(api.lobby).mockResolvedValue({ matchId: null, searching: false, invites: [] });
  render(
    <MemoryRouter>
      <OnlineDurakLobby />
    </MemoryRouter>,
  );
  await act(async () => {});
  expect(screen.getByRole('tab', { name: 'Игра с персонажем' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const steps = character === 'Дарья' ? 0 : character === 'Григорий' ? 1 : 3;
  for (let n = 0; n < steps; n++)
    fireEvent.click(screen.getByRole('button', { name: 'Следующий персонаж' }));
  fireEvent.click(screen.getByRole('button', { name: `Сыграть с ${name}` }));
  expect(screen.getByRole('dialog')).toHaveTextContent(`Дурак с ${name}`);
  expect(screen.getByRole('dialog')).toHaveTextContent(character);
});

it('separates character selection from online search and preserves the selected hero', async () => {
  vi.mocked(api.lobby).mockResolvedValue({ matchId: null, searching: false, invites: [] });
  render(
    <MemoryRouter>
      <OnlineDurakLobby />
    </MemoryRouter>,
  );
  await act(async () => {});
  expect(screen.getByRole('button', { name: 'Предыдущий персонаж' })).toBeDisabled();
  expect(screen.queryByText('Текущие партии')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Начать поиск' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Следующий персонаж' }));
  expect(screen.getByRole('img', { name: 'Панорама бара «4-й период»' })).toBeInTheDocument();
  showOnline();
  expect(screen.getByRole('button', { name: 'Начать поиск' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Сыграть с Григорием' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Игра с персонажем' }));
  expect(screen.getByRole('button', { name: 'Сыграть с Григорием' })).toBeInTheDocument();
  expect(screen.queryByText('Легко')).not.toBeInTheDocument();
});

it('changes one hero with a horizontal swipe but ignores vertical scrolling', async () => {
  vi.mocked(api.lobby).mockResolvedValue({ matchId: null, searching: false, invites: [] });
  render(
    <MemoryRouter>
      <OnlineDurakLobby />
    </MemoryRouter>,
  );
  await act(async () => {});
  const carousel = screen.getByRole('region', { name: 'Выбор персонажа' });
  fireEvent.touchStart(carousel, { touches: [{ clientX: 250, clientY: 150 }] });
  fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 90, clientY: 160 }] });
  expect(screen.getByRole('button', { name: 'Сыграть с Григорием' })).toBeInTheDocument();
  fireEvent.touchStart(carousel, { touches: [{ clientX: 200, clientY: 100 }] });
  fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 150, clientY: 300 }] });
  expect(screen.getByRole('button', { name: 'Сыграть с Григорием' })).toBeInTheDocument();
});

it('moves one shared panorama between heroes and the online terminal', async () => {
  vi.mocked(api.lobby).mockResolvedValue({ matchId: null, searching: false, invites: [] });
  render(<MemoryRouter><OnlineDurakLobby /></MemoryRouter>);
  await act(async () => {});
  const main = document.querySelector('main')!;
  const image = screen.getByRole('img', { name: 'Панорама бара «4-й период»' });
  expect(image).toHaveAttribute('src', '/bar/cards/bar-populated-panorama-v2.webp');
  expect(main).toHaveAttribute('data-scene', '0');
  fireEvent.click(screen.getByRole('button', { name: 'Следующий персонаж' }));
  expect(main).toHaveAttribute('data-scene', '1');
  expect(screen.getByRole('img', { name: 'Панорама бара «4-й период»' })).toBe(image);
  showOnline();
  expect(main).toHaveAttribute('data-scene', '4');
  expect(screen.getByRole('button', { name: 'Начать поиск' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Игра с персонажем' }));
  expect(main).toHaveAttribute('data-scene', '1');
  expect(screen.getByRole('button', { name: 'Сыграть с Григорием' })).toBeInTheDocument();
});

it('opens online for a pending invitation and blocks a competing computer game', async () => {
  vi.mocked(api.lobby).mockResolvedValue({ matchId: null, searching: false, invites: [{
    id: 'incoming', sender_id: 'other', receiver_id: 'player', sender_name: 'Александр',
    receiver_name: 'Игрок', status: 'pending', match_id: null, expires_at: '2099-01-01T00:00:00Z',
  }] });
  render(<MemoryRouter><OnlineDurakLobby /></MemoryRouter>);
  await act(async () => {});
  expect(screen.getByRole('tab', { name: /^Игра онлайн/ })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('tab', { name: 'Игра с персонажем' }));
  expect(screen.getByRole('button', { name: 'Сыграть с Дарьей' })).toBeDisabled();
});
