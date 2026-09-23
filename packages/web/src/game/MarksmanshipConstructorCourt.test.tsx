import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  getDailyPeriodSpeedPreset,
  DEFAULT_MARKSMANSHIP_V4_SCORING_RULES,
  buildMarksmanshipReplaySnapshot,
  deriveShotSeed,
  getGoalie,
  getSessionPhaseOffsets,
  simulateGoal,
  simulateGoalie,
  simulateShooter,
} from '@hockey/game-core';
import { MarksmanshipConstructorCourt, getConstructorScene } from './MarksmanshipConstructorCourt.js';

vi.mock('./PixiStage.js', () => ({ PixiStage: ({ preloadAssets }: { preloadAssets: string[] }) =>
  <div data-testid="constructor-pixi-stage" data-assets={preloadAssets.join(',')} /> }));

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
      frequency: speeds.goalieFrequency }, deriveShotSeed(seed, 1, 1), 1, 0,
    offsets.goalie).position.x);
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

  it('shows centered pre-start figures without motion or future markers', () => {
    render(<MarksmanshipConstructorCourt seed="constructor-start-a" timeMs={0}
      goalie={getGoalie('rookie')} shotIndex={1} showHitboxes preStart />);
    expect(screen.getByLabelText('Хитбоксы фигур')).toBeInTheDocument();
    expect(screen.queryByLabelText('Ворота при прилёте шайбы')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Линия броска игрока')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Игрок движется/)).not.toBeInTheDocument();
    const hitboxes = screen.getByLabelText('Хитбоксы фигур').querySelectorAll('rect');
    expect(Number(hitboxes[0]?.getAttribute('x')) + Number(hitboxes[0]?.getAttribute('width')) / 2)
      .toBe(286);
    expect(Number(hitboxes[1]?.getAttribute('x')) + Number(hitboxes[1]?.getAttribute('width')) / 2)
      .toBe(286);
    expect(Number(hitboxes[2]?.getAttribute('x')) + Number(hitboxes[2]?.getAttribute('width')) / 2)
      .toBe(286);
  });

  it('shows the amateur rink, coordinate grid and optional hitboxes without changing the scene', () => {
    const goalie = getGoalie('rookie');
    const props = { seed: 'constructor-start-a', timeMs: 0, goalie, shotIndex: 1 };
    const { rerender } = render(<MarksmanshipConstructorCourt {...props} showHitboxes />);
    expect(screen.getByRole('img', { name: 'Любительская площадка' })).toHaveAttribute(
      'src', '/sprites/amateur-daily-court.webp');
    expect(screen.getByTestId('constructor-pixi-stage')).toBeInTheDocument();
    expect(screen.getByTestId('constructor-pixi-stage')).toHaveAttribute('data-assets',
      expect.stringContaining('/sprites/test-goalie-black.webp'));
    expect(screen.getByLabelText('Координатная сетка')).toBeInTheDocument();
    expect(screen.getByLabelText('Хитбоксы фигур')).toBeInTheDocument();
    const currentBoxes = screen.getByLabelText('Хитбоксы фигур').querySelectorAll('rect');
    expect(currentBoxes[1]?.getAttribute('height')).toBe(currentBoxes[0]?.getAttribute('height'));
    expect(currentBoxes[2]?.getAttribute('height')).toBe(currentBoxes[0]?.getAttribute('height'));
    const playerArrow = screen.getByLabelText(/Игрок движется (влево|вправо)/);
    const arrowY = Number(playerArrow.getAttribute('transform')?.match(/translate\([^ ]+ ([^)]+)\)/)?.[1]);
    expect(arrowY).toBe(Number(currentBoxes[2]?.getAttribute('y')));
    rerender(<MarksmanshipConstructorCourt {...props} showHitboxes={false} />);
    expect(screen.queryByLabelText('Хитбоксы фигур')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Координатная сетка')).toBeInTheDocument();
    expect(screen.getByLabelText('Линия броска игрока')).toBeInTheDocument();
    expect(screen.getByLabelText(/Игрок движется (влево|вправо)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Ворота движутся (влево|вправо)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Вратарь движется (влево|вправо)/)).toBeInTheDocument();
  });

  it('places the playable layer at the same vertical bounds as the daily game', () => {
    render(<MarksmanshipConstructorCourt seed="constructor-start-a" timeMs={0}
      goalie={getGoalie('rookie')} shotIndex={1} showHitboxes />);
    expect(screen.getByTestId('constructor-pixi-stage').parentElement).toHaveStyle({
      top: '24.55%', height: '74.2%',
    });
    expect(screen.getByLabelText('Координатная сетка').parentElement).toHaveStyle({
      top: '24.55%', height: '74.2%',
    });
  });

  it('marks the future goal position used to resolve the shot', () => {
    const seed = 'constructor-start-a';
    const goalie = getGoalie('rookie');
    const timeMs = 0;
    const speeds = getDailyPeriodSpeedPreset(1);
    const snapshot = buildMarksmanshipReplaySnapshot({
      shotInput: { tapTime: timeMs, shooterTapTime: timeMs,
        puckSpeedPerMs: speeds.puckSpeedPerMs,
        shooterFrequency: speeds.shooterFrequency,
        goalieFrequency: speeds.goalieFrequency,
        goalFrequency: speeds.goalFrequency },
      goalie, seed: deriveShotSeed(seed, 1, 1), shotIndex: 1,
      phaseOffsets: getSessionPhaseOffsets(seed), earliestTapTime: 0,
      scoring: DEFAULT_MARKSMANSHIP_V4_SCORING_RULES,
    });
    const { rerender } = render(<MarksmanshipConstructorCourt seed={seed} timeMs={timeMs} goalie={goalie}
      shotIndex={1} showHitboxes />);
    const future = screen.getByLabelText('Ворота при прилёте шайбы');
    const center = (snapshot.goalCross.goalHitbox.minX + snapshot.goalCross.goalHitbox.maxX) / 2;
    expect(Number(future.getAttribute('data-center-x'))).toBeCloseTo(center, 3);
    expect(screen.queryByText('ПРИ ПРИЛЁТЕ')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Будущие ворота движутся/)).toBeInTheDocument();
    const futureGoalie = screen.getByLabelText('Вратарь при встрече с шайбой');
    const goalieCenter = (snapshot.goalieCross.goalieHitbox.minX +
      snapshot.goalieCross.goalieHitbox.maxX) / 2;
    expect(Number(futureGoalie.getAttribute('data-center-x'))).toBeCloseTo(goalieCenter, 3);
    expect(screen.getByLabelText(/Будущий вратарь движется/)).toBeInTheDocument();
    expect(futureGoalie.querySelector('rect')).not.toBeNull();
    expect(futureGoalie.querySelector('rect')?.getAttribute('height'))
      .toBe(future.querySelector('rect')?.getAttribute('height'));
    expect(future.querySelector('rect')).toHaveAttribute('stroke', '#169a5c');
    expect(Number(future.querySelector('rect')?.getAttribute('stroke-opacity'))).toBeLessThan(1);
    rerender(<MarksmanshipConstructorCourt seed={seed} timeMs={timeMs} goalie={goalie}
      shotIndex={1} showHitboxes={false} />);
    expect(screen.getByLabelText('Ворота при прилёте шайбы').querySelector('rect')).toBeNull();
    expect(screen.getByLabelText('Вратарь при встрече с шайбой').querySelector('rect')).toBeNull();
  });

  it('draws separate sampled motion trails even when hitboxes are hidden', () => {
    const props = { seed: 'constructor-start-a', timeMs: 100, goalie: getGoalie('rookie'),
      shotIndex: 1, showHitboxes: false };
    const { rerender } = render(<MarksmanshipConstructorCourt {...props} />);
    const goalTrail = screen.getByLabelText('Путь ворот до встречи с шайбой');
    const goalieTrail = screen.getByLabelText('Путь вратаря до встречи с шайбой');
    expect(goalTrail.querySelectorAll('polyline')).toHaveLength(1);
    expect(goalTrail.querySelector('polyline')).toHaveAttribute('stroke', '#169a5c');
    expect(goalieTrail.querySelectorAll('polyline')).toHaveLength(1);
    for (const attribute of ['stroke-width', 'stroke-opacity', 'stroke-dasharray']) {
      expect(goalTrail.querySelector('polyline')?.getAttribute(attribute))
        .toBe(goalieTrail.querySelector('polyline')?.getAttribute(attribute));
    }
    expect(goalTrail.querySelectorAll('polygon').length).toBeGreaterThan(0);
    expect(goalieTrail.querySelectorAll('polygon').length).toBeGreaterThan(0);
    expect(goalTrail.querySelector('polyline')?.getAttribute('points')?.split(' ').length)
      .toBeGreaterThan(3);
    for (const trail of [goalTrail, goalieTrail]) {
      const points = trail.querySelector('polyline')!.getAttribute('points')!.split(' ')
        .map((point) => Number(point.split(',')[1]));
      expect(Math.abs(points[8]! - points[0]!)).toBeGreaterThan(20);
    }
    rerender(<MarksmanshipConstructorCourt {...props} preStart />);
    expect(screen.queryByLabelText('Путь ворот до встречи с шайбой')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Путь вратаря до встречи с шайбой')).not.toBeInTheDocument();
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
