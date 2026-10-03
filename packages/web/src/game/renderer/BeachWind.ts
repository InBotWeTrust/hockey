import { Graphics } from 'pixi.js';
import type { Scale } from '../coords.js';
export type BeachWindTarget = 'player' | 'goalie' | 'goal';
/** Localized moving streaks and sand, drawn in the same coordinate plane as the entity. */
export class BeachWind {
  readonly container = new Graphics();
  private previousX = 0;
  private previousTarget: BeachWindTarget | null = null;
  private direction = 1;
  update(time: number, target: BeachWindTarget | null, x: number, y: number, scale: Scale, reducedMotion: boolean): void {
    this.container.clear();
    if (!target) { this.previousTarget = null; return; }
    if (this.previousTarget === target && Math.abs(x - this.previousX) > .01) this.direction = Math.sign(x - this.previousX);
    this.previousTarget = target; this.previousX = x;
    const f = scale.factor;
    for (let i = 0; i < 24; i++) {
      const travel = reducedMotion ? .5 : ((time / 240 + i * .173) % 1);
      const px = x + (travel - .5) * 310 * f * this.direction;
      const py = y + ((i * 19) % 130 - 65) * f;
      const length = (32 + (i % 4) * 13) * f;
      this.container.moveTo(px - this.direction * length, py).lineTo(px, py - 4 * f)
        .stroke({ color: 0xf1eee3, alpha: .255 + (i % 3) * .12, width: 2.5 * f });
      this.container.circle(px - 7 * f, py + 7 * f, (1.5 + i % 3) * f)
        .fill({ color: 0xc4ad7e, alpha: .25 });
    }
  }
  destroy(): void { this.container.destroy(); }
}
