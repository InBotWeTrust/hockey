import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpectatorRink } from './SpectatorRink.js';
import { ReplayBuffer } from './replay.js';
import type { BarPlayer } from './types.js';

const mocks = vi.hoisted(() => {
  const actors: Array<{ update: (...args: never[]) => void; destroy: () => void }> = [];
  const app = {
    start: vi.fn(),
    stop: vi.fn(),
    stage: { addChild: vi.fn() },
    ticker: { maxFPS: 60, add: vi.fn() },
  };
  class Actor {
    container = { visible: true };
    update = vi.fn();
    destroy = vi.fn();
    resetAtStart = vi.fn();
    playShot = vi.fn();
    triggerGoalLight = vi.fn();
    shotPath = vi.fn(() => ({ start: { x: 286, y: 600 }, end: { x: 286, y: 80 } }));
    setSavePose = vi.fn();
    constructor() {
      actors.push(this);
    }
  }
  return { actors, app, Actor };
});
vi.mock('../game/renderer/Player.js', () => ({ Player: mocks.Actor }));
vi.mock('../game/renderer/Goal.js', () => ({ Goal: mocks.Actor }));
vi.mock('../game/renderer/Goalie.js', () => ({ Goalie: mocks.Actor }));
vi.mock('../game/renderer/Puck.js', async (importOriginal) => {
  const { Puck } = await importOriginal<typeof import('../game/renderer/Puck.js')>();
  return {
    Puck: class extends Puck {
      constructor(...args: ConstructorParameters<typeof Puck>) {
        super(...args);
        const puck: InstanceType<typeof Puck> = this;
        vi.spyOn(puck, 'update');
        vi.spyOn(puck, 'destroy');
        mocks.actors.push(this);
      }
    },
  };
});
vi.mock('../game/PixiStage.js', async () => {
  const { useEffect } = await import('react');
  return {
    PixiStage: ({ onReady }: { onReady: (app: unknown, scale: unknown) => void }) => {
      useEffect(() => {
        onReady(mocks.app, { factor: 1, offsetX: 0, offsetY: 0 });
      }, []);
      return null;
    },
  };
});
const player: BarPlayer = {
  userId: 'a',
  name: 'Игрок',
  avatarUrl: null,
  grip: 'left',
  goals: 0,
  state: 'period_active',
  period: 1,
  until: null,
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  mocks.actors.length = 0;
});
describe('spectator scene lifecycle', () => {
  it.each([
    ['duel', '/sprites/amateur-daily-court.webp'],
    ['tournament', '/sprites/amateur-tournament-court.webp'],
  ] as const)('uses the current %s match court', (kind, src) => {
    const view = render(<SpectatorRink player={player} buffer={new ReplayBuffer()} kind={kind} />);
    expect(view.container.querySelector('.bar-rink-background')).toHaveAttribute('src', src);
    expect(view.container.querySelector('.bar-rink-stage')).toHaveStyle({
      top: '24.55%',
      height: '74.2%',
    });
  });
  it('does not activate the obsolete red goal light during replay', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const buffer = new ReplayBuffer();
    buffer.push([
      {
        id: 'goal',
        userId: 'a',
        period: 1,
        index: 1,
        result: 'goal',
        createdAt: '2026-10-07T12:00:00Z',
        shooterX: 286,
        goalX: 286,
        goalieX: 286,
      },
    ]);
    render(<SpectatorRink player={player} buffer={buffer} />);
    const tick = mocks.app.ticker.add.mock.calls[0]![0] as () => void;
    act(() => tick());
    now = 500;
    act(() => tick());
    expect(screen.getByText('ГОЛ')).toBeInTheDocument();
    expect(
      (mocks.actors[1] as InstanceType<typeof mocks.Actor>).triggerGoalLight,
    ).not.toHaveBeenCalled();
  });

  it('moves the puck on consecutive replay shots after holding the first endpoint', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const buffer = new ReplayBuffer();
    buffer.push(
      [1, 2].map((index) => ({
        id: `shot-${index}`,
        userId: 'a',
        period: 1,
        index,
        result: 'goal' as const,
        createdAt: `2026-10-07T12:00:0${index}Z`,
        shooterX: 286,
        goalX: 286,
        goalieX: 286,
      })),
    );
    render(<SpectatorRink player={player} buffer={buffer} />);
    const tick = mocks.app.ticker.add.mock.calls[0]![0] as () => void;
    const puck = mocks.actors[3] as unknown as import('../game/renderer/Puck.js').Puck;
    act(() => tick());
    now = 900;
    act(() => tick());
    expect(puck.isHeld()).toBe(true);
    now = 1400;
    act(() => tick());
    expect(puck.isHeld()).toBe(false);
    const startY = puck.container.position.y;
    now = 1500;
    act(() => tick());
    expect(puck.container.position.y).toBeLessThan(startY);
    expect(puck.isFlying()).toBe(true);
  });

  it('hides players and puck during the break and restores them when play resumes', () => {
    const buffer = new ReplayBuffer();
    const view = render(<SpectatorRink player={player} buffer={buffer} />);
    const tick = mocks.app.ticker.add.mock.calls[0]![0] as () => void;
    const actors = mocks.actors as unknown as Array<{ container: { visible: boolean } }>;
    act(() => tick());
    view.rerender(<SpectatorRink player={{ ...player, state: 'break_active' }} buffer={buffer} />);
    act(() => tick());
    expect(actors[0]!.container.visible).toBe(false);
    expect(actors[2]!.container.visible).toBe(false);
    expect(actors[3]!.container.visible).toBe(false);
    expect(actors[1]!.container.visible).toBe(true);
    view.rerender(<SpectatorRink player={player} buffer={buffer} />);
    act(() => tick());
    for (const actor of actors) expect(actor.container.visible).toBe(true);
  });

  it('centers the goal during a break and resumes the observed offset afterwards', () => {
    const buffer = new ReplayBuffer();
    const motion = {
      userId: 'a',
      period: 1,
      sampledAt: '2026-10-07T12:00:00Z',
      frames: [{ offsetMs: 0, shooterX: 286, goalOffsetX: 100, goalieX: 286, goalieY: 80 }],
    };
    const view = render(
      <SpectatorRink
        player={{ ...player, state: 'break_active' }}
        buffer={buffer}
        motion={motion}
      />,
    );
    const tick = mocks.app.ticker.add.mock.calls[0]![0] as () => void;
    act(() => tick());
    expect(mocks.actors[1]!.update).toHaveBeenLastCalledWith(
      { factor: 1, offsetX: 0, offsetY: 0 },
      0,
    );
    view.rerender(<SpectatorRink player={player} buffer={buffer} motion={motion} />);
    act(() => tick());
    expect(mocks.actors[1]!.update).toHaveBeenLastCalledWith(
      { factor: 1, offsetX: 0, offsetY: 0 },
      100,
    );
  });

  it('shows the player current result during a break', () => {
    render(
      <SpectatorRink
        player={{ ...player, state: 'break_active', goals: 7, shots: 2, shotsTaken: 12 }}
        buffer={new ReplayBuffer()}
      />,
    );
    const result = screen.getByRole('status');
    expect(result).toHaveTextContent('Текущий результат');
    expect(result).toHaveTextContent('Голы7');
    expect(result).toHaveTextContent('Броски12');
    expect(result).toHaveTextContent('Процент58%');
    expect(result).not.toHaveTextContent('Период');
    expect(result).toHaveClass('modal-card');
  });

  it('shows zero percent before any shots', () => {
    render(
      <SpectatorRink
        player={{ ...player, state: 'break_active', shotsTaken: 0 }}
        buffer={new ReplayBuffer()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Процент0%');
  });
  it('keeps the scene on score updates, stops when hidden and destroys actors when leaving', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const buffer = new ReplayBuffer();
    const view = render(<SpectatorRink player={player} buffer={buffer} />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(document.querySelector('.user-avatar')).not.toBeNull();
    expect(screen.getByText('ПЕРИОД')).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(mocks.app.ticker.maxFPS).toBe(30);
    expect(mocks.actors).toHaveLength(4);
    view.rerender(<SpectatorRink player={{ ...player, goals: 1 }} buffer={buffer} />);
    expect(mocks.actors).toHaveLength(4);
    hidden.mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(mocks.app.stop).toHaveBeenCalledOnce();
    hidden.mockReturnValue(false);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(mocks.app.start).toHaveBeenCalledOnce();
    view.unmount();
    for (const actor of mocks.actors) expect(actor.destroy).toHaveBeenCalledOnce();
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(mocks.app.start).toHaveBeenCalledOnce();
  });
});
