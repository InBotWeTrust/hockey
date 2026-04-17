import type { ShotInput } from '@hockey/game-core';
import type { Scale } from '../coords.js';

export interface InputAdapter {
  attach: (
    canvas: HTMLCanvasElement,
    getScale: () => Scale,
    onShot: (input: ShotInput) => void,
  ) => void;
  detach: () => void;
}
