import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { it, expect, vi, afterEach } from 'vitest';
import { OnlineDurakScreen } from './OnlineDurakScreen.js';
import * as api from './onlineApi.js';
vi.mock('./onlineApi.js', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  snapshot: vi.fn(),
  move: vi.fn(),
}));
const view: api.OnlineSnapshot = {
  id: 'match',
  hand: [{ id: 'hearts-6', suit: 'hearts', rank: 6 }],
  opponentCount: 6,
  deckCount: 24,
  trump: 'clubs',
  trumpCard: { id: 'clubs-9', rank: 9, suit: 'clubs' },
  attacker: 0,
  table: [],
  limit: 6,
  phase: 'attack',
  revision: 0,
  result: null,
  deadline: Date.now() + 20000,
  serverNow: Date.now(),
  opponent: { displayName: 'Олег', avatarUrl: null },
};
const mount = () =>
  render(
    <MemoryRouter initialEntries={['/bar/cards/match/match']}>
      <Routes>
        <Route path="/bar/cards/match/:id" element={<OnlineDurakScreen />} />
      </Routes>
    </MemoryRouter>,
  );
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});
it('keeps newer server state when an older poll arrives after a move', async () => {
  vi.useFakeTimers();
  let stale!: (next: api.OnlineSnapshot) => void;
  vi.mocked(api.snapshot)
    .mockResolvedValueOnce(view)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          stale = resolve;
        }),
    );
  vi.mocked(api.move).mockResolvedValue({
    ...view,
    revision: 1,
    phase: 'defend',
    hand: [],
    table: [{ attack: view.hand[0]! }],
  });
  mount();
  await act(async () => {});
  await act(async () => {
    vi.advanceTimersByTime(1500);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '6 ♥' }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '6 ♥' }));
  });
  expect(screen.queryByRole('button', { name: '6 ♥' })).not.toBeInTheDocument();
  await act(async () => stale(view));
  expect(screen.queryByRole('button', { name: '6 ♥' })).not.toBeInTheDocument();
  expect(screen.getByText('Ход соперника')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Соперник с картами' })).toBeInTheDocument();
  expect(screen.queryByText('Олег (6)')).not.toBeInTheDocument();
});
it('restores the persisted hand after a transient connection failure', async () => {
  vi.useFakeTimers();
  vi.mocked(api.snapshot).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(view);
  mount();
  await act(async () => {});
  expect(screen.getByText('Связь потеряна. Восстанавливаем…')).toBeInTheDocument();
  await act(async () => {
    vi.advanceTimersByTime(1500);
  });
  expect(screen.getByRole('button', { name: '6 ♥' })).toBeInTheDocument();
});
it('waits for explicit readiness and hides the hand before starting', async () => {
  const waiting = { ...view, hand: [], readiness: { selfReady: false, opponentReady: false,
    expiresAt: Date.now() + 60000, startsAt: null, cancelled: false } };
  vi.mocked(api.snapshot).mockResolvedValue(waiting);
  vi.mocked(api.move).mockResolvedValue({ ...waiting, revision: 1,
    readiness: { ...waiting.readiness, selfReady: true } });
  mount();
  await act(async () => {});
  expect(screen.queryByRole('button', { name: '6 ♥' })).not.toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Готов' })); });
  expect(api.move).toHaveBeenCalledWith('match', 0, 'ready');
  expect(screen.getByRole('button', { name: 'Вы готовы' })).toBeDisabled();
});

it('returns to the current bar after closing the online game result',async()=>{
 vi.mocked(api.snapshot).mockResolvedValue({...view,phase:'ended',result:0});
 render(<MemoryRouter initialEntries={['/bar/cards/match/match']}><Routes>
  <Route path="/bar/cards/match/:id" element={<OnlineDurakScreen/>}/>
  <Route path="/bar" element={<div>Актуальный бар</div>}/>
  <Route path="/bar/cards/online" element={<div>Старый экран Дурак</div>}/>
 </Routes></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:'Понятно'}));
 expect(await screen.findByText('Актуальный бар')).toBeInTheDocument();
 expect(screen.queryByText('Старый экран Дурак')).not.toBeInTheDocument();
});
it('returns to the current bar when readiness is cancelled',async()=>{
 vi.mocked(api.snapshot).mockResolvedValue({...view,hand:[],readiness:{selfReady:false,opponentReady:false,expiresAt:Date.now()+60000,startsAt:null,cancelled:true}});
 render(<MemoryRouter initialEntries={['/bar/cards/match/match']}><Routes>
  <Route path="/bar/cards/match/:id" element={<OnlineDurakScreen/>}/>
  <Route path="/bar" element={<div>Актуальный бар</div>}/>
  <Route path="/bar/cards/online" element={<div>Старый экран Дурак</div>}/>
 </Routes></MemoryRouter>);
 await screen.findAllByText('Встреча отменена: готовность не подтверждена.');
 fireEvent.click(screen.getByRole('button',{name:'Вернуться'}));
 expect(await screen.findByText('Актуальный бар')).toBeInTheDocument();
});
