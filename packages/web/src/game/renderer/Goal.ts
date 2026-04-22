import { Container, Sprite } from 'pixi.js';
import { GOAL, RINK } from '@hockey/game-core';
import type { Scale } from '../coords.js';

// gate.webp: 640×344, aspect 1.86:1 — use GOAL.width for display width
const GATE_W = 78;
const GATE_H = 42; // 78 / 1.86
const HALF = GATE_W / 2;
const INNER_MARGIN = 6;

export class Goal {
  readonly container = new Container();
  private readonly sprite: Sprite;

  constructor() {
    this.sprite = Sprite.from('/sprites/gate.webp');
    this.sprite.anchor.set(0.5, 0.5);
    this.container.addChild(this.sprite);
  }

  update(scale: Scale, offsetRinkX = 0): void {
    const s = scale.factor;
    this.sprite.width  = GATE_W * s;
    this.sprite.height = GATE_H * s;
    const rawX = GOAL.x + GOAL.width / 2 + offsetRinkX;
    const clampedX = Math.max(HALF + INNER_MARGIN, Math.min(RINK.width - HALF - INNER_MARGIN, rawX));
    this.sprite.position.set(
      Math.round(clampedX * s),
      Math.round((GOAL.y + GOAL.height) * s),
    );
    this.container.position.set(Math.round(scale.offsetX), Math.round(scale.offsetY));
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
