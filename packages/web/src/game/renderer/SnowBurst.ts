import { Graphics } from 'pixi.js';
import type { Scale } from '../coords.js';
/** Short spray under a slipping entity; uses scene time, never wall-clock timers. */
export class SnowBurst {
  readonly container = new Graphics();
  private startedAt = -Infinity;
  private origin = { x: 0, y: 0 };
  update(
    ageMs: number | null,
    x: number,
    y: number,
    scale: Scale,
    reducedMotion: boolean,
    timeMs = 0,
  ): void {
    this.container.clear();
    if (ageMs !== null) {
      const onset = timeMs - ageMs;
      if (Math.abs(onset - this.startedAt) > 1) {
        this.startedAt = onset;
        this.origin = { x, y };
      }
    }
    const age = timeMs - this.startedAt;
    if (age < 0 || age > 900 || reducedMotion) return;
    const t = age / 900,
      s = scale.factor;
    for (let i = 0; i < 42; i++) {
      const spread = ((i % 7) - 3) * 5;
      const px = this.origin.x + (-10 + (i % 6) * 4 + t * (55 + (i % 5) * 17)) * s;
      const py = this.origin.y + (spread - t * (22 + (i % 4) * 12) + t * t * 35) * s;
      this.container
        .circle(px, py, (3 + (i % 4)) * (1 - t * 0.65) * s)
        .fill({ color: 0xf6fcff, alpha: (1 - t) * 0.9 });
    }
  }
  destroy(): void {
    this.container.destroy();
  }
}
