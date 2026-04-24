import { BlurFilter, Container, Graphics, Sprite } from 'pixi.js';
import { GOAL } from '@hockey/game-core';
import type { Scale } from '../coords.js';

// gate.webp: 640×344, aspect 1.86:1 — +10% сверх предыдущих 90×48.
const GATE_W = 99;
const GATE_H = 53; // 99 / 1.86

const LIGHT_DURATION_MS = 900;
const LIGHT_PEAK_ALPHA  = 0.40;

export class Goal {
  readonly container = new Container();
  private readonly light: Graphics;
  private readonly sprite: Sprite;
  private lightStartedAt: number | null = null;

  constructor() {
    this.light = new Graphics()
      .ellipse(0, 0, GATE_W * 0.36, GATE_H * 0.55)
      .fill({ color: 0xff1a1a });
    this.light.filters = [new BlurFilter({ strength: 14 })];
    this.light.alpha = 0;

    this.sprite = Sprite.from('/sprites/gate.webp');
    this.sprite.anchor.set(0.5, 0.5);

    // light renders behind the gate sprite
    this.container.addChild(this.light);
    this.container.addChild(this.sprite);
  }

  triggerGoalLight(): void {
    this.lightStartedAt = performance.now();
  }

  update(scale: Scale, offsetRinkX = 0): void {
    const s = scale.factor;
    this.sprite.width  = GATE_W * s;
    this.sprite.height = GATE_H * s;
    const rawX = GOAL.x + GOAL.width / 2 + offsetRinkX;
    const cx = rawX * s;
    const cy = (GOAL.y + GOAL.height) * s;
    this.sprite.position.set(cx, cy);
    // light sits at the back of the net (top edge of goal rect)
    this.light.position.set(cx, (GOAL.y + GATE_H * 0.3) * s);
    this.light.scale.set(s);
    this.container.position.set(scale.offsetX, scale.offsetY);

    if (this.lightStartedAt !== null) {
      const t = (performance.now() - this.lightStartedAt) / LIGHT_DURATION_MS;
      if (t >= 1) {
        this.light.alpha = 0;
        this.lightStartedAt = null;
      } else {
        // fast fade-in (0→0.2), hold (0.2→0.6), fade-out (0.6→1.0)
        const a = t < 0.2
          ? t / 0.2
          : t < 0.6
            ? 1
            : 1 - (t - 0.6) / 0.4;
        this.light.alpha = a * LIGHT_PEAK_ALPHA;
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
