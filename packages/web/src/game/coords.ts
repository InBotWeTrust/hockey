import { RINK, type Vec2 } from '@hockey/game-core';

export interface Scale {
  factor: number;
  offsetX: number;
  offsetY: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export function computeScale(vp: Viewport): Scale {
  const factor = Math.min(vp.width / RINK.width, vp.height / RINK.height);
  const offsetX = (vp.width - RINK.width * factor) / 2;
  const offsetY = (vp.height - RINK.height * factor) / 2;
  return { factor, offsetX, offsetY };
}

export function rinkToScreen(p: Vec2, s: Scale): Vec2 {
  return {
    x: p.x * s.factor + s.offsetX,
    y: p.y * s.factor + s.offsetY,
  };
}

export function screenToRink(p: Vec2, s: Scale): Vec2 {
  return {
    x: (p.x - s.offsetX) / s.factor,
    y: (p.y - s.offsetY) / s.factor,
  };
}
