import { expect, it, vi } from 'vitest';

vi.mock('pixi.js', () => ({ Container: class Container {} }));
vi.mock('./PixiStage.js', () => ({ PixiStage: () => null }));
vi.mock('./renderer/Goal.js', () => ({ Goal: class Goal {} }));
vi.mock('./renderer/Goalie.js', () => ({ Goalie: class Goalie {} }));
vi.mock('./renderer/Hitboxes.js', () => ({ Hitboxes: class Hitboxes {} }));
vi.mock('./renderer/IceCar.js', () => ({ IceCar: class IceCar {}, iceCarPosAt: vi.fn() }));
vi.mock('./renderer/Player.js', () => ({ Player: class Player {} }));
vi.mock('./renderer/Puck.js', () => ({ Puck: class Puck {} }));

vi.mock('../screens/DailyScreen.js', () => {
  throw new Error('game/PlayView must not load screens/DailyScreen');
});

it('loads independently from the Daily screen module', async () => {
  const playViewModule = await import('./PlayView.js');

  expect(playViewModule.PlayView).toEqual(expect.any(Function));
});

it('raises every NHL arena slightly without changing the source asset geometry', async () => {
  const playViewModule = await import('./PlayView.js');

  expect(
    playViewModule.resolveLongCourtBackgroundPlacement(
      '/bonus-games/nhl-cities/arenas/toronto.webp?v=test',
    ),
  ).toEqual({ top: '-0.25%', height: '100.25%' });
  expect(
    playViewModule.resolveLongCourtBackgroundPlacement(
      '/bonus-games/hockey-cities/arenas/minsk.webp?v=test',
    ),
  ).toEqual({ top: '0', height: '100%' });
});
