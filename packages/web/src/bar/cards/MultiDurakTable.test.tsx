import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { MultiDurakTable } from './MultiDurakTable.js';
import type { RoomView } from './roomApi.js';
afterEach(cleanup);
it('uses a silhouette for two seats and keeps opponent details in the menu', () => {
  const view = { ...base, capacity: 2, seats: base.seats.slice(0, 2) };
  render(
    <MemoryRouter>
      <MultiDurakTable view={view} busy={false} error={null} now={1000} onCommand={vi.fn()} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('img', { name: 'Соперник с картами' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Меню игры' })).toHaveTextContent('(6)Борис');
  expect(screen.getByText('Борис')).toBeInTheDocument();
  expect(screen.queryByText('Борис (6)')).not.toBeInTheDocument();
});
const card = { id: 'clubs-6', rank: 6, suit: 'clubs' as const };
const base: RoomView = {
  id: 'room',
  owner: 'a',
  capacity: 3,
  status: 'playing',
  searchUntil: null,
  countdownAt: null,
  proposed: false,
  ready: [],
  revision: 1,
  serverNow: 1000,
  pending: [],
  seats: [
    { userId: 'a', displayName: 'Александр', avatarUrl: null, count: 6, status: 'playing' },
    { userId: 'b', displayName: 'Борис', avatarUrl: null, count: 6, status: 'playing' },
    { userId: 'c', displayName: 'Егор', avatarUrl: null, count: 6, status: 'playing' },
  ],
  game: {
    player: 0,
    hand: [card],
    deckCount: 18,
    trump: 'clubs',
    trumpCard: card,
    attacker: 0,
    defender: 1,
    turn: 0,
    table: [],
    phase: 'attack',
    taking: false,
    deadline: 21000,
    actions: [{ type: 'play', cardId: card.id }],
    result: null,
  },
};
it('selects on the first click and sends a move only on confirmation', () => {
  const send = vi.fn();
  render(
    <MemoryRouter>
      <MultiDurakTable view={base} busy={false} error={null} now={1000} onCommand={send} />
    </MemoryRouter>,
  );
  const hand = screen.getByRole('group', { name: 'Твои карты' });
  const button = within(hand).getByRole('button');
  fireEvent.click(button);
  expect(send).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent('Подтвердить выбор');
  fireEvent.click(button);
  expect(send).toHaveBeenCalledWith({ type: 'move', action: { type: 'play', cardId: 'clubs-6' } });
});
it('shows a pass instruction instead of suggesting an impossible throw-in', () => {
  const send = vi.fn();
  const view = {
    ...base,
    game: { ...base.game!, phase: 'throw' as const, actions: [{ type: 'pass' as const }] },
  };
  render(
    <MemoryRouter>
      <MultiDurakTable view={view} busy={false} error={null} now={18000} onCommand={send} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Нажми «Бито»');
  fireEvent.click(screen.getByRole('button', { name: 'Бито' }));
  expect(send).toHaveBeenCalledWith({ type: 'move', action: { type: 'pass' } });
});
it('requires confirmation before surrendering', () => {
  const send = vi.fn();
  render(
    <MemoryRouter>
      <MultiDurakTable view={base} busy={false} error={null} now={1000} onCommand={send} />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Выйти из игры' }));
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Выйти из игры' }));
  fireEvent.click(screen.getByRole('button', { name: 'Сдаться' }));
  expect(send).toHaveBeenCalledWith({ type: 'leave' });
});
it('shows readiness on the table without dealing cards or enabling moves', () => {
  const send = vi.fn();
  render(<MemoryRouter><MultiDurakTable view={{ ...base, game: null, status: 'confirming',
    readyUntil: 61000, ready: ['b'] }} userId="a" busy={false} error={null} now={1000} onCommand={send} /></MemoryRouter>);
  expect(screen.getByRole('timer')).toHaveTextContent('60');
  expect(screen.getAllByText('Готов')).toHaveLength(2);
  expect(document.querySelector('.durak-ready-panel')).toBeNull();
  expect(document.querySelector('.durak-controls')).toBeNull();
  expect(within(screen.getByRole('group', { name: 'Твои карты' })).queryByRole('button')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Готов' }));
  expect(send).toHaveBeenCalledWith({ type: 'ready' });
});
it('places six seats around the table and marks self separately from taking', () => {
  const seats = Array.from({ length: 6 }, (_, i) => ({ userId: String(i), displayName: `Player ${i}`, avatarUrl: null, count: 6, status: 'playing' }));
  const { container } = render(<MemoryRouter><MultiDurakTable view={{ ...base, capacity: 6, seats,
    game: { ...base.game!, player: 1, defender: 1, taking: true } }} busy={false} error={null} now={1000} onCommand={vi.fn()} /></MemoryRouter>);
  expect(Array.from(container.querySelectorAll('.durak-seat-position')).map(el => el.textContent)).toEqual(['1', '2', '3', '6', '5', '4']);
  expect(container.querySelector('[data-self="true"]')).toHaveAttribute('data-taking', 'true');
  expect(screen.getByText('Берёт карты')).toBeInTheDocument();
});

it('keeps trump visible in the menu after the deck is empty', () => {
  render(<MemoryRouter><MultiDurakTable view={{ ...base, capacity: 6, seats: Array.from({ length: 6 }, (_, i) => ({ ...base.seats[0]!, userId: String(i) })), game: { ...base.game!, deckCount: 0 } }} busy={false} error={null} now={1000} onCommand={vi.fn()} /></MemoryRouter>);
  expect(screen.getByLabelText('Козырь ♣')).toBeInTheDocument();
});

it('uses finish when the defender is taking instead of calling the cards beaten', () => {
  render(
    <MemoryRouter>
      <MultiDurakTable
        view={{
          ...base,
          game: { ...base.game!, taking: true, phase: 'throw', actions: [{ type: 'pass' }] },
        }}
        busy={false}
        error={null}
        now={1000}
        onCommand={vi.fn()}
      />
    </MemoryRouter>,
  );
  expect(screen.getByRole('button', { name: 'Завершить' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Борис берёт. Заверши ход.');
});
it('does not ask an empty hand to throw in at the end of the game', () => {
  render(
    <MemoryRouter>
      <MultiDurakTable
        view={{
          ...base,
          game: {
            ...base.game!,
            hand: [],
            deckCount: 0,
            phase: 'throw',
            actions: [{ type: 'pass' }],
          },
        }}
        busy={false}
        error={null}
        now={1000}
        onCommand={vi.fn()}
      />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('button', { name: 'Бито' })).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Завершаем заход');
});

it.each([2, 3, 4, 5, 6])('shows menu trump only at a six-player table (%i seats)', capacity => {
  const seats = Array.from({ length: capacity }, (_, i) => ({ ...base.seats[0]!, userId: String(i), displayName: `Player ${i}` }));
  render(<MemoryRouter><MultiDurakTable view={{ ...base, capacity, seats }} busy={false} error={null} now={1000} onCommand={vi.fn()} /></MemoryRouter>);
  const menu = screen.getByRole('region', { name: 'Меню игры' });
  if (capacity === 6) expect(within(menu).getByText('Козырь')).toBeInTheDocument();
  else expect(within(menu).queryByText('Козырь')).not.toBeInTheDocument();
});

it('keeps the countdown notice above the table with no lower readiness container',()=>{
 render(<MemoryRouter><MultiDurakTable view={{...base,game:null,status:'countdown',countdownAt:4000,ready:['a','b']}} userId="a" busy={false} error={null} now={1000} onCommand={()=>{}}/></MemoryRouter>);
 expect(screen.getAllByText('Игра начинается')).toHaveLength(1);
 expect(document.querySelector('.durak-ready-actions')).toBeNull();
 expect(document.querySelector('.durak-controls')).toBeNull();
});
it.each([true,false])('names the defender taking cards and offers valid choices (throw=%s)',canThrow=>{
 const game={...base.game!,phase:'throw' as const,taking:true,table:[{attack:card}],actions:[{type:'pass' as const},...(canThrow?[{type:'play' as const,cardId:card.id}]:[])]};
 render(<MemoryRouter><MultiDurakTable view={{...base,game}} userId="a" busy={false} error={null} now={1000} onCommand={()=>{}}/></MemoryRouter>);
 expect(screen.getByRole('status')).toHaveTextContent(canThrow?'Борис берёт. Подкинь или заверши ход.':'Борис берёт. Заверши ход.');
});
