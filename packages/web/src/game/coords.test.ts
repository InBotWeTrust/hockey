import { describe, it, expect } from 'vitest';
import { RINK } from '@hockey/game-core';
import {
  computeScale,
  rinkToScreen,
  screenToRink,
  type Scale,
} from './coords.js';

describe('computeScale', () => {
  it('fits rink into 390x700 viewport 1:1', () => {
    const s = computeScale({ width: 390, height: 700 });
    expect(s.factor).toBe(1);
    expect(s.offsetX).toBe(0);
    expect(s.offsetY).toBe(0);
  });

  it('scales uniformly and centers when viewport wider than rink', () => {
    const s = computeScale({ width: 780, height: 700 });
    expect(s.factor).toBe(1);
    expect(s.offsetX).toBe((780 - 390) / 2);
    expect(s.offsetY).toBe(0);
  });

  it('scales uniformly and centers when viewport taller than rink', () => {
    const s = computeScale({ width: 390, height: 1400 });
    expect(s.factor).toBe(1);
    expect(s.offsetY).toBe((1400 - 700) / 2);
  });

  it('shrinks when viewport smaller', () => {
    const s = computeScale({ width: 195, height: 350 });
    expect(s.factor).toBe(0.5);
  });
});

describe('rinkToScreen / screenToRink', () => {
  const scale: Scale = { factor: 0.5, offsetX: 10, offsetY: 20 };

  it('rinkToScreen maps origin', () => {
    expect(rinkToScreen({ x: 0, y: 0 }, scale)).toEqual({ x: 10, y: 20 });
  });

  it('round-trips a rink-space point', () => {
    const p = { x: 195, y: 660 };
    const screen = rinkToScreen(p, scale);
    const back = screenToRink(screen, scale);
    expect(back.x).toBeCloseTo(p.x, 6);
    expect(back.y).toBeCloseTo(p.y, 6);
  });

  it('RINK corners map within viewport bounds', () => {
    const s = computeScale({ width: 780, height: 700 });
    const bottomRight = rinkToScreen({ x: RINK.width, y: RINK.height }, s);
    expect(bottomRight.x).toBeLessThanOrEqual(780);
    expect(bottomRight.y).toBeLessThanOrEqual(700);
  });
});
