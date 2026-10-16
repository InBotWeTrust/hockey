import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { createMatch, type BarGameSnapshot } from '@hockey/game-core';
import { GameTable } from './BarGameScreen.js';
const view = (): BarGameSnapshot => ({
  id: 'test',
  kind: 'darts',
  character: 'maria',
  player: 0,
  participants: [
    { userId: 'p', displayName: 'Игрок', avatarUrl: '/player.webp' },
    { userId: 'maria', displayName: 'Мария', avatarUrl: '/bar/cards/avatar-v2.webp' },
  ],
  runtime: createMatch('darts', 0, 0, false, 1),
  ready: null,
  serverNow: 0,
});
it('uses the card menu with two avatars, a central timer and feedback above the field', () => {
  const v = view();
  const { container } = render(<GameTable view={v} now={0} disabled={false} send={() => {}} />);
  const menu = screen.getByRole('region', { name: 'Меню игры' });
  expect(menu).toHaveClass('durak-menu', 'game-scoreboard-stack');
  expect(within(menu).getByRole('img', { name: 'Твой аватар' })).toBeInTheDocument();
  expect(within(menu).getByRole('img', { name: 'Аватар: Мария' })).toBeInTheDocument();
  expect(within(menu).getByRole('timer', { name: 'Осталось времени' })).toHaveTextContent('40');
  expect(within(menu).getByRole('status')).toHaveTextContent('Твой ход');
  expect(menu.nextElementSibling).toBe(container.querySelector('.bar-game-field'));
  expect(container.querySelector('.bar-game-turn')).toBeNull();
});
it('reports the actual hit result in the feedback strip and preserves timer warning colours', () => {
  const v = view();
  v.runtime.feedback = { type: 'dart', actor: 0, points: 20, bust: false };
  v.runtime.animationStart = 32000;
  v.runtime.game.kind === 'darts' && (v.runtime.game.scores[0] = 281);
  render(<GameTable view={v} now={33000} disabled={false} send={() => {}} />);
  const menu = screen.getByRole('region', { name: 'Меню игры' });
  expect(within(menu).getByRole('status')).toHaveTextContent('20 очков');
  expect(within(menu).getByRole('timer')).toHaveAttribute('data-tone', 'warning');
});
it('shows a bust rather than awarded points after an overscoring dart', () => {
  const v = view();
  v.runtime.feedback = { type: 'dart', actor: 0, points: 60, bust: true };
  v.runtime.animationStart = 36000;
  render(<GameTable view={v} now={37000} disabled={false} send={() => {}} />);
  expect(
    within(screen.getByRole('region', { name: 'Меню игры' })).getByRole('status'),
  ).toHaveTextContent('Перебор');
  expect(screen.getByRole('timer')).toHaveAttribute('data-tone', 'danger');
});
it.each(['darts', 'billiards', 'checkers'] as const)(
  'keeps %s field free of duplicate instructions and character commentary',
  (kind) => {
    const v = view();
    v.kind = kind;
    v.runtime = createMatch(kind, 0, 0, true, 1);
    const { container } = render(<GameTable view={v} now={0} disabled={false} send={() => {}} />);
    expect(container.querySelector('.bar-game-reply')).toBeNull();
    expect(screen.queryByText('Проведи дротик вверх')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Меню игры' })).toBeInTheDocument();
  },
);

it.each([
  [1, '1 очко'],
  [2, '2 очка'],
  [5, '5 очков'],
  [11, '11 очков'],
  [21, '21 очко'],
  [22, '22 очка'],
])('inflects %s points', (points, text) => {
  const v = view();
  v.runtime.feedback = { type: 'dart', actor: 0, points: Number(points) };
  render(<GameTable view={v} now={800} disabled={false} send={() => {}} />);
  expect(screen.getByRole('status')).toHaveTextContent(String(text));
});

it('shows the dart result for two seconds after contact, then only the next action', () => {
  const v = view();
  v.runtime.feedback = { type: 'dart', actor: 0, points: 5 };
  if (v.runtime.game.kind === 'darts') v.runtime.game.dartsLeft = 1;
  const { rerender } = render(<GameTable view={v} now={800} disabled={false} send={() => {}} />);
  expect(screen.getByRole('status')).toHaveTextContent(/^Ты: 5 очков$/);
  rerender(<GameTable view={v} now={2700} disabled={false} send={() => {}} />);
  expect(screen.getByRole('status')).toHaveTextContent(/^Твой ход · Осталось дротиков: 1$/);
});
it('keeps pool instructions in the menu notice and removes field hints', () => {
  const v = view();
  v.kind = 'billiards';
  v.runtime = createMatch('billiards', 0, 0, false, 1);
  const { container, rerender } = render(
    <GameTable view={v} now={0} disabled={false} send={() => {}} />,
  );
  expect(screen.getByRole('status')).toHaveTextContent(/^Твой ход · Прицелься и выбери силу$/);
  expect(container.querySelector('.bar-game-hint')).toBeNull();
  if (v.runtime.game.kind === 'billiards') v.runtime.game.ballInHand = true;
  rerender(<GameTable view={v} now={0} disabled={false} send={() => {}} />);
  expect(screen.getByRole('status')).toHaveTextContent('Выбери место для битка');
  v.runtime.missed[0] = 1;
  rerender(<GameTable view={v} now={0} disabled={false} send={() => {}} />);
  expect(screen.getByRole('status')).toHaveTextContent(/^Следующий пропуск – поражение$/);
});
it('starts pool counters at zero and counts pocketed group balls with compact group markers', () => {
  const v = view();
  v.kind = 'billiards';
  v.runtime = createMatch('billiards', 0, 0, false, 1);
  const { container, rerender } = render(
    <GameTable view={v} now={0} disabled={false} send={() => {}} />,
  );
  expect([...container.querySelectorAll('.durak-player-count')].map((n) => n.textContent)).toEqual([
    '(0)',
    '(0)',
  ]);
  expect(screen.queryByRole('img', { name: 'Сплошные шары' })).toBeNull();
  if (v.runtime.game.kind === 'billiards') {
    v.runtime.game.groups = ['solids', 'stripes'];
    v.runtime.game.balls = v.runtime.game.balls.map((b) => ({
      ...b,
      pocketed: [1, 2, 9, 0, 8].includes(b.id),
    }));
  }
  rerender(<GameTable view={v} now={0} disabled={false} send={() => {}} />);
  expect([...container.querySelectorAll('.durak-player-count')].map((n) => n.textContent)).toEqual([
    '(2)',
    '(1)',
  ]);
  expect(container.querySelector('.bar-game-player--self')).toContainElement(
    screen.getByRole('img', { name: 'Сплошные шары' }),
  );
  expect(container.querySelector('.bar-game-player--opponent')).toContainElement(
    screen.getByRole('img', { name: 'Полосатые шары' }),
  );
  expect(screen.getByRole('img', { name: 'Полосатые шары' })).toBeInTheDocument();
  expect(screen.getByRole('timer')).not.toContainElement(
    screen.getByRole('img', { name: 'Сплошные шары' }),
  );
  expect(screen.getByRole('timer')).not.toContainElement(
    screen.getByRole('img', { name: 'Полосатые шары' }),
  );
});
it.each([
  { pocketed: [], foul: false, winner: null, result: 'Шар не забит' },
  { pocketed: [], foul: true, winner: null, result: 'Фол' },
  { pocketed: [1], foul: false, winner: null, result: '1 шар' },
  { pocketed: [8], foul: false, winner: 0, result: 'Партия завершена' },
] as const)(
  'hides pool outcome until motion ends: $result',
  ({ pocketed, foul, winner, result }) => {
    const v = view();
    v.kind = 'billiards';
    v.runtime = createMatch('billiards', 0, 0, false, 1);
    v.runtime.feedback = { type: 'shot', actor: 0, pocketed: [...pocketed], foul };
    v.runtime.animationUntil = 5000;
    v.runtime.game.winner = winner;
    const { rerender } = render(<GameTable view={v} now={1000} disabled={false} send={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent(/^Ход выполняется…$/);
    expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'warning');
    rerender(<GameTable view={v} now={5000} disabled={false} send={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent(result);
  },
);
it('does not replay stale stroke metadata after cue-ball placement', () => {
  const v = view();
  v.kind = 'billiards';
  v.runtime = createMatch('billiards', 0, 0, false, 1);
  v.runtime.animationStart = 100;
  v.runtime.animationUntil = 100;
  v.runtime.feedback = { type: 'place', actor: 0 };
  v.runtime.poolShot = { angle: 1, power: 0.5, cue: { x: 0.5, y: 1.5 } };
  const { container } = render(<GameTable view={v} now={100} disabled={false} send={() => {}} />);
  expect(container.querySelector('.bar-pool-stroke')).toBeNull();
});


it('shows thinking after board motion without freezing the character clock', () => {
  const v = view();
  v.kind = 'checkers';
  v.character = 'arsenich';
  v.participants[1] = { userId: 'arsenich', displayName: 'Арсенич', avatarUrl: null };
  v.runtime = createMatch('checkers', 1, 0, true, 12);
  render(<GameTable view={v} now={1000} disabled={false} send={() => {}} />);
  expect(screen.getByRole('status')).toHaveTextContent('Арсенич думает…');
  expect(screen.getByRole('timer')).toHaveTextContent('39');
});


it('reveals the pool result after motion while the character is still thinking', () => {
  const v = view();
  v.kind = 'billiards';
  v.runtime = createMatch('billiards', 0, 0, true, 12);
  v.runtime.game.turn = 1;
  v.runtime.feedback = { type: 'shot', actor: 0, pocketed: [1], foul: false };
  const balls = v.runtime.game.kind === 'billiards' ? v.runtime.game.balls : [];
  v.runtime.poolFrames = Array.from({ length: 61 }, () => balls);
  v.runtime.animationUntil = 5000;
  const { rerender } = render(<GameTable view={v} now={1000} disabled={false} send={() => {}} />);
  expect(screen.getByRole('status')).toHaveTextContent(/^Ход выполняется…$/);
  rerender(<GameTable view={v} now={2000} disabled={false} send={() => {}} />);
  expect(screen.getByRole('status')).toHaveTextContent('Ты: 1 шар');
  expect(screen.getByRole('status')).toHaveTextContent('думает…');
});
it('shows the simultaneous arm inactivity warning as danger in the shared notice',()=>{
 const v=view();v.kind='armwrestling';v.runtime=createMatch('armwrestling',0,0,false,1);
 if(v.runtime.game.kind==='armwrestling')v.runtime.game.warning=[true,false];
 render(<GameTable view={v} now={5000} disabled={false} send={()=>{}}/>);
 expect(screen.getByRole('status')).toHaveTextContent('Вернись к управлению, иначе поражение');
 expect(screen.getByRole('status')).toHaveAttribute('data-tone','danger');
});
