import { describe, expect, it, vi } from 'vitest';
import type { Graphics } from 'pixi.js';
import { Goal } from './Goal.js';
import { Goalie } from './Goalie.js';
import { Player } from './Player.js';

const scale = { factor: 1, offsetX: 0, offsetY: 0 };

describe('animated rink renderers', () => {
  it('keeps moving shadows filter-free and reuses their geometry between frames', () => {
    const player = new Player('right', { shadow: true });
    const goalie = new Goalie({ shadow: true });
    const playerShadow = player.container.children[0] as Graphics;
    const goalieShadow = goalie.container.children[0] as Graphics;
    const playerClear = vi.spyOn(playerShadow, 'clear');
    const goalieClear = vi.spyOn(goalieShadow, 'clear');

    player.update(scale, 200, 500);
    player.update(scale, 220, 500);
    goalie.update({ position: { x: 260, y: 120 }, width: 50, height: 70 }, scale);
    goalie.update({ position: { x: 280, y: 120 }, width: 50, height: 70 }, scale);

    expect(playerShadow.filters).toBeUndefined();
    expect(goalieShadow.filters).toBeUndefined();
    expect(playerClear).not.toHaveBeenCalled();
    expect(goalieClear).not.toHaveBeenCalled();
  });

  it('renders the goal flash without a realtime blur filter', () => {
    const goal = new Goal();
    const light = goal.container.children[0];

    expect(light?.filters).toBeUndefined();
  });
});
