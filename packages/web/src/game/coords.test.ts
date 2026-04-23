import { describe, it, expect } from 'vitest';
import { RINK } from '@hockey/game-core';
import {
  computeScale,
  rinkToScreen,
  screenToRink,
  type Scale,
} from './coords.js';

describe('computeScale', () => {
  it(`fits rink into ${RINK.width}x${RINK.height} viewport 1:1`, () => {
    const s = computeScale({ width: RINK.width, height: RINK.height });
    expect(s.factor).toBe(1);
    expect(s.offsetX).toBe(0);
    expect(s.offsetY).toBe(0);
  });

  it('scales uniformly and centers when viewport wider than rink', () => {
    const s = computeScale({ width: RINK.width * 2, height: RINK.height });
    expect(s.factor).toBe(1);
    expect(s.offsetX).toBe((RINK.width * 2 - RINK.width) / 2);
    expect(s.offsetY).toBe(0);
  });

  it('scales uniformly and centers when viewport taller than rink', () => {
    const s = computeScale({ width: RINK.width, height: RINK.height * 2 });
    expect(s.factor).toBe(1);
    expect(s.offsetY).toBe((RINK.height * 2 - RINK.height) / 2);
  });

  it('shrinks when viewport smaller', () => {
    const s = computeScale({ width: RINK.width / 2, height: RINK.height / 2 });
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
    const vpW = RINK.width * 2;
    const vpH = RINK.height;
    const s = computeScale({ width: vpW, height: vpH });
    const bottomRight = rinkToScreen({ x: RINK.width, y: RINK.height }, s);
    expect(bottomRight.x).toBeLessThanOrEqual(vpW);
    expect(bottomRight.y).toBeLessThanOrEqual(vpH);
  });
});
