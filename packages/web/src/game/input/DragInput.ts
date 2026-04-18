import type { ShotInput, Vec2 } from '@hockey/game-core';
import { PUCK_START } from '@hockey/game-core';
import type { InputAdapter } from './InputAdapter.js';
import type { Scale } from '../coords.js';
import { screenToRink } from '../coords.js';

export const MAX_DRAG = 400;

const PUCK_HIT_RADIUS_RINK = 40;

export function computeShotFromDrag(
  startRink: Vec2,
  endRink: Vec2,
  releaseTime: number,
): ShotInput {
  const dragX = endRink.x - startRink.x;
  const dragY = endRink.y - startRink.y;
  const shotX = -dragX;
  const shotY = -dragY;
  const angle = Math.atan2(shotX, -shotY);
  const length = Math.hypot(dragX, dragY);
  const power = Math.max(0, Math.min(1, length / MAX_DRAG));
  return { angle, power, releaseTime };
}

export function createDragInput(): InputAdapter {
  let canvas: HTMLCanvasElement | null = null;
  let scaleGetter: (() => Scale) | null = null;
  let onShot: ((input: ShotInput) => void) | null = null;
  let dragStartRink: Vec2 | null = null;

  const toRink = (ev: PointerEvent): Vec2 | null => {
    if (!canvas || !scaleGetter) return null;
    const rect = canvas.getBoundingClientRect();
    return screenToRink(
      { x: ev.clientX - rect.left, y: ev.clientY - rect.top },
      scaleGetter(),
    );
  };

  const onDown = (ev: PointerEvent): void => {
    const p = toRink(ev);
    if (!p) return;
    const dx = p.x - PUCK_START.x;
    const dy = p.y - PUCK_START.y;
    if (Math.hypot(dx, dy) > PUCK_HIT_RADIUS_RINK) return;
    dragStartRink = p;
    canvas?.setPointerCapture(ev.pointerId);
  };

  const onUp = (ev: PointerEvent): void => {
    if (!dragStartRink) return;
    const end = toRink(ev);
    if (!end || !onShot) {
      dragStartRink = null;
      return;
    }
    onShot(computeShotFromDrag(dragStartRink, end, performance.now()));
    dragStartRink = null;
    canvas?.releasePointerCapture(ev.pointerId);
  };

  return {
    attach(c, getScale, cb) {
      canvas = c;
      scaleGetter = getScale;
      onShot = cb;
      c.addEventListener('pointerdown', onDown);
      c.addEventListener('pointerup', onUp);
      c.addEventListener('pointercancel', onUp);
    },
    detach() {
      canvas?.removeEventListener('pointerdown', onDown);
      canvas?.removeEventListener('pointerup', onUp);
      canvas?.removeEventListener('pointercancel', onUp);
      canvas = null;
      scaleGetter = null;
      onShot = null;
      dragStartRink = null;
    },
  };
}
