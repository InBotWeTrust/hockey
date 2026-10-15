import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import {
  barCheckers,
  barPool,
  createMatch,
  type BarGameSnapshot,
  type barDarts,
} from '@hockey/game-core';
import { CheckersField, PoolField, DartsField } from './GameFields.js';
import { GameResult, GameHelp } from './GameModals.js';
const snapshot = (kind: 'darts' | 'billiards' | 'checkers'): BarGameSnapshot => ({
  id: 'test',
  kind,
  character: kind === 'darts' ? 'maria' : kind === 'billiards' ? 'veronika' : 'arsenich',
  player: 0,
  participants: [
    { userId: 'a', displayName: 'Я', avatarUrl: null },
    { userId: 'bot', displayName: 'Персонаж', avatarUrl: null },
  ],
  runtime: createMatch(kind, 0, 0, true, 1),
  ready: null,
  serverNow: 0,
});
it('offers only legal checkers destinations and sends the complete selected path', () => {
  const game = barCheckers.create(0),
    send = vi.fn();
  render(<CheckersField game={game} disabled={false} send={send} />);
  const path = barCheckers.moves(game)[0]!;
  fireEvent.click(screen.getByRole('button', { name: `Клетка ${path[0]! + 1}` }));
  fireEvent.click(screen.getByRole('button', { name: `Клетка ${path[1]! + 1}` }));
  expect(send).toHaveBeenCalledWith({ type: 'checkers', path });
});
it('blocks a pool shot until the player has aimed, shows a power slider', () => {
  const send = vi.fn();
  render(
    <PoolField
      game={barPool.create(0)}
      balls={barPool.create(0).balls}
      disabled={true}
      send={send}
    />,
  );
  expect(screen.getByRole('slider', { name: 'Сила удара' })).toBeDisabled();
  expect(send).not.toHaveBeenCalled();
});
it('shows accurate game rules and the close control in its header', () => {
  render(<GameHelp kind="darts" close={() => {}} />);
  expect(screen.getByRole('dialog')).toHaveTextContent('301');
  expect(screen.getByRole('dialog')).toHaveTextContent('40 секунд');
  expect(screen.getByRole('button', { name: 'Закрыть' }).closest('.modal-header')).not.toBeNull();
});
it('uses character art and reply plus repeat/back, while online only acknowledges', () => {
  const view = snapshot('darts');
  view.runtime.game.winner = 0;
  view.runtime.reason = 'played';
  const { rerender } = render(<GameResult view={view} replay={() => {}} back={() => {}} />);
  expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  expect(screen.getByRole('img')).toHaveAttribute('src', '/bar/games/darts-character-win-v2.webp');
  rerender(<GameResult view={{ ...view, character: null }} replay={() => {}} back={() => {}} />);
  expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Понятно' })).toBeInTheDocument();
});
it('renders a precise dartboard rather than generated scoring geometry', () => {
  render(
    <DartsField
      game={snapshot('darts').runtime.game as barDarts.Game}
      lastDart={null}
      disabled={true}
      send={() => {}}
    />,
  );
  expect(screen.getByLabelText('Мишень для дартса')).toBeInTheDocument();
  expect(screen.getByText('20')).toBeInTheDocument();
});

it('shows flight before one embedded dart, with impact after contact', () => {
  const g = createMatch('darts', 0, 0, false, 1).game as barDarts.Game;
  const hit = { x: 0, y: 0 };
  g.hits = [hit];
  const props = { game: g, lastDart: hit, animationStart: 100, disabled: true, send: vi.fn() };
  const { container, rerender } = render(<DartsField {...props} now={200} />);
  expect(container.querySelectorAll('.bar-dart-flight')).toHaveLength(1);
  expect(container.querySelectorAll('.bar-dart-impact')).toHaveLength(0);
  const delay = (container.querySelector('.bar-dart-flight') as SVGElement).style.animationDelay;
  rerender(<DartsField {...props} now={400} />);
  expect((container.querySelector('.bar-dart-flight') as SVGElement).style.animationDelay).toBe(
    delay,
  );
  rerender(<DartsField {...props} now={850} />);
  expect(container.querySelector('.bar-dart-flight')).toBeNull();
  expect(container.querySelectorAll('.bar-dart-impact')).toHaveLength(1);
  rerender(<DartsField {...props} now={1700} />);
  expect(container.querySelector('.bar-dart-impact')).toBeNull();
});

it('shows an initial pool cue and allows power without an initial table tap', () => {
  const game = barPool.create(0);
  const { container } = render(
    <PoolField game={game} balls={game.balls} disabled={false} send={vi.fn()} />,
  );
  expect(container.querySelector('.bar-pool-cue')).not.toBeNull();
  expect(screen.getByRole('slider')).toBeEnabled();
});
it('shows opponent aim, then the stroke, then removes the cue during ball motion', () => {
  const game = barPool.create(1);
  const props = {
    game,
    balls: game.balls,
    disabled: true,
    opponent: true,
    send: vi.fn(),
    animationStart: 100,
  };
  const { container, rerender } = render(
    <PoolField {...props} now={0} aim={{ angle: 1, power: 0.6, actor: 1 }} />,
  );
  expect((container.querySelector('.bar-pool-cue-angle') as SVGElement)?.style.transform).toContain(
    '57.295',
  );
  const shot = { angle: 1, power: 0.6, cue: { x: 0.5, y: 1.5 } };
  rerender(<PoolField {...props} now={500} shot={shot} />);
  expect(container.querySelector('.bar-pool-stroke')).not.toBeNull();
  rerender(<PoolField {...props} now={1000} shot={shot} opponent={true} />);
  expect(container.querySelector('.bar-pool-cue')).not.toBeNull();
  expect(container.querySelector('.bar-pool-impact')).not.toBeNull();
  rerender(<PoolField {...props} now={1400} shot={shot} opponent={true} />);
  expect(container.querySelector('.bar-pool-cue')).toBeNull();
  expect(container.querySelector('.bar-pool-impact')).toBeNull();
});
it('pulls the whole fixed-length cue back as power increases', () => {
  const game = barPool.create(0);
  const { container } = render(
    <PoolField game={game} balls={game.balls} disabled={false} send={vi.fn()} />,
  );
  const slider = screen.getByRole('slider');
  fireEvent.change(slider, { target: { value: '3' } });
  const body = container.querySelector('.bar-pool-cue-body');
  expect(body).not.toBeNull();
  const low = Number(body?.getAttribute('transform')?.match(/translate\(([^ ]+)/)?.[1]);
  const shape = body?.innerHTML;
  fireEvent.change(slider, { target: { value: '100' } });
  const high = Number(body?.getAttribute('transform')?.match(/translate\(([^ ]+)/)?.[1]);
  expect(low - high).toBeGreaterThan(0.15);
  expect(body?.innerHTML).toBe(shape);
});
it('animates a newly pocketed ball, but does not replay old pocketed balls', () => {
  vi.useFakeTimers();
  try {
    const game = barPool.create(0);
    const balls = game.balls.map((b) => (b.id === 1 ? { ...b, x: 0.025, y: 0.025 } : b));
    const props = { game, disabled: true, send: vi.fn() };
    const { container, rerender } = render(<PoolField {...props} balls={balls} />);
    const pocketed = balls.map((b) => (b.id === 1 ? { ...b, pocketed: true } : b));
    rerender(<PoolField {...props} balls={pocketed} />);
    expect(container.querySelector('.bar-pool-ball-sink')).not.toBeNull();
    act(() => vi.advanceTimersByTime(350));
    expect(container.querySelector('.bar-pool-ball-sink')).toBeNull();
    rerender(<PoolField {...props} balls={pocketed} />);
    expect(container.querySelector('.bar-pool-ball-sink')).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
it('starts pullback at zero, cancels without firing and sends selected spin with the shot', () => {
  const game = barPool.create(0),
    send = vi.fn();
  render(<PoolField game={game} balls={game.balls} disabled={false} send={send} />);
  const slider = screen.getByRole('slider', { name: 'Сила удара' });
  expect(slider).toHaveValue('0');
  expect(slider).toHaveAttribute('dir', 'rtl');
  fireEvent.change(slider, { target: { value: '70' } });
  fireEvent.pointerCancel(slider);
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: 'aim', power: 0.03, spin: { x: 0, y: 0 } }),
  );
  expect(slider).toHaveValue('0');
  expect(send.mock.calls.filter(([a]) => a.type === 'shot')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Выбрать точку удара' }));
  fireEvent.keyDown(screen.getByRole('button', { name: 'Точка удара по битку' }), {
    key: 'ArrowUp',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
  fireEvent.change(slider, { target: { value: '70' } });
  fireEvent.keyDown(slider, { key: 'Enter' });
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'shot', power: 0.7, spin: { x: 0, y: -0.1 } }),
  );
  expect(slider).toHaveValue('0');
});
