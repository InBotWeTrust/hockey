import { describe, expect, it } from 'vitest';
import { Puck } from './Puck.js';

describe('Puck', () => {
  it('applies a perspective rotation to the rendered puck', () => {
    const puck = new Puck('right', { rotation: -0.36 });

    puck.resetAtStart({ factor: 1, offsetX: 0, offsetY: 0 });

    expect(puck.container.rotation).toBeCloseTo(-0.36);
  });

  it('mirrors a custom blade offset by grip', () => {
    const leftPuck = new Puck('left', { bladeOffsetX: 41, bladeOffsetY: 29 });
    const rightPuck = new Puck('right', { bladeOffsetX: 41, bladeOffsetY: 29 });

    expect(leftPuck.bladePoint(100).x).toBe(59);
    expect(rightPuck.bladePoint(100).x).toBe(141);
  });

  it.each([
    ['left' as const, 59],
    ['right' as const, 141],
  ])('flies from the %s blade point to the physical shooter line', (grip, x) => {
    const puck = new Puck(grip, { bladeOffsetX: 41, bladeOffsetY: 29 });

    const path = puck.shotPath(100, 60);

    expect(path.start).toEqual({ x, y: 609 });
    expect(path.end).toEqual({ x: 100, y: 60 });
  });

  it('does not move backward when the render clock is behind shot start time', () => {
    const puck = new Puck('right');
    const scale = { factor: 1, offsetX: 0, offsetY: 0 };

    puck.playShot({ x: 100, y: 500 }, { x: 100, y: 100 }, 1000, 300);
    puck.update(950, scale);

    expect(puck.container.position.x).toBe(100);
    expect(puck.container.position.y).toBe(500);
  });

  it('holds the completed shot endpoint until it is explicitly released', () => {
    const puck = new Puck('right');
    const scale = { factor: 1, offsetX: 0, offsetY: 0 };

    puck.playShot({ x: 100, y: 500 }, { x: 180, y: 100 }, 1000, 300);
    puck.update(1300, scale);

    expect(puck.isFlying()).toBe(false);
    expect(puck.isHeld()).toBe(true);
    expect(puck.container.position.x).toBe(180);
    expect(puck.container.position.y).toBe(100);

    puck.release();
    expect(puck.isHeld()).toBe(false);
  });
});
