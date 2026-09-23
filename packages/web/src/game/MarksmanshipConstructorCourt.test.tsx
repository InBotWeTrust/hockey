import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  getDailyPeriodSpeedPreset,
  getGoalie,
  getSessionPhaseOffsets,
  simulateGoal,
  simulateGoalie,
  simulateShooter,
} from '@hockey/game-core';
import { MarksmanshipConstructorCourt, getConstructorScene } from './MarksmanshipConstructorCourt.js';

vi.mock('./PixiStage.js', () => ({ PixiStage: () => <div data-testid="constructor-pixi-stage" /> }));

describe('controlled marksmanship court', () => {
  it('uses the first daily period speeds and seed phase offsets at time zero', () => {
    const seed = 'constructor-start-a';
    const goalie = getGoalie('rookie');
    const speeds = getDailyPeriodSpeedPreset(1);
    const offsets = getSessionPhaseOffsets(seed);
    const scene = getConstructorScene(seed, 0, goalie, 1);
    expect(scene.playerX).toBe(simulateShooter(offsets.shooter, speeds.shooterFrequency).x);
    expect(scene.goalOffsetX).toBe(simulateGoal({ ...goalie, goalFrequency: speeds.goalFrequency },
      0, offsets.goal).offsetX);
    expect(scene.goalieState.position.x).toBe(simulateGoalie({ ...goalie,
      frequency: speeds.goalieFrequency }, seed, 1, 0, offsets.goalie).position.x);
  });

  it('moves all three entities when elapsed time advances', () => {
    const goalie = getGoalie('rookie');
    const start = getConstructorScene('constructor-start-a', 0, goalie, 1);
    const later = getConstructorScene('constructor-start-a', 250, goalie, 1);
    expect(later.playerX).not.toBe(start.playerX);
    expect(later.goalOffsetX).not.toBe(start.goalOffsetX);
    expect(later.goalieState.position.x).not.toBe(start.goalieState.position.x);
  });

  it('changes the initial arrangement when a different seed is selected', () => {
    const goalie = getGoalie('rookie');
    const a = getConstructorScene('constructor-start-a', 0, goalie, 1);
    const b = getConstructorScene('constructor-start-b', 0, goalie, 1);
    expect([a.playerX, a.goalOffsetX, a.goalieState.position.x]).not.toEqual([
      b.playerX, b.goalOffsetX, b.goalieState.position.x,
    ]);
  });

  it('shows the amateur rink, coordinate grid and optional hitboxes without changing the scene', () => {
    const goalie = getGoalie('rookie');
    const props = { seed: 'constructor-start-a', timeMs: 0, goalie, shotIndex: 1 };
    const { rerender } = render(<MarksmanshipConstructorCourt {...props} showHitboxes />);
    expect(screen.getByRole('img', { name: 'Любительская площадка' })).toHaveAttribute(
      'src', '/sprites/amateur-daily-court.webp');
    expect(screen.getByTestId('constructor-pixi-stage')).toBeInTheDocument();
    expect(screen.getByLabelText('Координатная сетка')).toBeInTheDocument();
    expect(screen.getByLabelText('Хитбоксы фигур')).toBeInTheDocument();
    rerender(<MarksmanshipConstructorCourt {...props} showHitboxes={false} />);
    expect(screen.queryByLabelText('Хитбоксы фигур')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Координатная сетка')).toBeInTheDocument();
  });

  it('sends dragged player center to manual mode', () => {
    const onDragCenter = vi.fn();
    render(<MarksmanshipConstructorCourt seed="constructor-start-a" timeMs={0}
      goalie={getGoalie('rookie')} shotIndex={1} showHitboxes
      onDragCenter={onDragCenter} />);
    const handle = screen.getByRole('button', { name: 'Двигать игрока' });
    fireEvent.pointerDown(handle, { clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 220, pointerId: 1 });
    expect(onDragCenter).toHaveBeenCalledWith('player', expect.any(Number));
  });
});
