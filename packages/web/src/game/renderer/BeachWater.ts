import { Graphics } from 'pixi.js';
import type { BeachPuddleRule } from '@hockey/game-core';
import { createBeachWaterSampler, projectBeachWaterY } from '../beachWaterVisuals.js';
import type { Scale } from '../coords.js';

/** Overlay on the existing arena; collision geometry comes exclusively from the shared core. */
export class BeachWater {
  readonly container = new Graphics();
  private splashState: { x: number; y: number; time: number } | null = null;
  private previous = new Map<string, { rx: number; ry: number }>();
  splash(x: number, y: number, time: number): void { this.splashState = { x, y, time }; }
  private sample: ReturnType<typeof createBeachWaterSampler>;
  constructor(rules: readonly BeachPuddleRule[]) { this.sample = createBeachWaterSampler(rules); }
  setRules(rules: readonly BeachPuddleRule[]): void { this.sample = createBeachWaterSampler(rules); }
  update(time: number, scale: Scale, frozenTime: number | null, showHint = false): void {
    this.container.clear();
    const yScale = projectBeachWaterY(1) - projectBeachWaterY(0);
    for (const puddle of this.sample(time, frozenTime)) {
      const x = puddle.x * scale.factor + scale.offsetX;
      const y = projectBeachWaterY(puddle.y) * scale.factor + scale.offsetY;
      let rx = puddle.radiusX * scale.factor;
      let ry = puddle.radiusY * yScale * scale.factor;
      const before = this.previous.get(puddle.id);
      if (before && before.rx > rx) {
        rx += (before.rx - rx) * .75;
        ry += (before.ry - ry) * .75;
      }
      this.previous.set(puddle.id, { rx, ry });
      if (rx <= 0 || ry <= 0) continue;
      if (showHint && puddle.active && puddle.id === 'left' && time < 9000) {
        const pulse = .5 + .5 * Math.sin(time / 240);
        this.container.ellipse(x, y, rx + 5 * scale.factor * pulse, ry + 3 * scale.factor * pulse)
          .stroke({ color: 0xe0e4dc, alpha: .2 + .3 * pulse, width: 2 * scale.factor });
      }
      // Thin translucent layers feather into the photographed ice instead of
      // drawing a coloured outline. Rink markings remain visible through water.
      const wetAlpha = puddle.active ? .024 : .009 + .002 * Math.sin(time / 700);
      for (let layer = 0; layer < 16; layer += 1) {
        const radius = 1 - layer * .022;
        this.container.ellipse(x, y, rx * radius, ry * radius)
          .fill({ color: 0x596668, alpha: wetAlpha });
      }
      if (puddle.active && puddle.deepRatio > 0) {
        for (let layer = 0; layer < 14; layer += 1) {
          const radius = puddle.deepRatio * (1 - layer * .033);
          this.container.ellipse(x, y, rx * radius, ry * radius)
            .fill({ color: 0x3e5055, alpha: .019 });
        }
      }
      // Broad, faint sky reflection: no neon rim or separate target-like centre.
      if (puddle.active) {
        for (let layer = 0; layer < 6; layer += 1) {
          const radius = 1 - layer * .09;
          this.container.ellipse(x - rx * .12, y - ry * .19,
            rx * .58 * radius, ry * .16 * radius)
            .fill({ color: 0xe0e4dc, alpha: .014 });
        }
      }
    }
    if (this.splashState) {
      const splash = this.splashState;
      const progress = Math.max(0, (time - splash.time) / 450);
      if (progress >= 1) this.splashState = null;
      else {
        const x = splash.x * scale.factor + scale.offsetX;
        const y = projectBeachWaterY(splash.y) * scale.factor + scale.offsetY;
        for (let ring = 0; ring < 3; ring += 1) {
          const radius = (8 + progress * 28 + ring * 6) * scale.factor;
          this.container.ellipse(x, y, radius, radius * .42)
            .stroke({ color: 0xe0e4dc, alpha: (1 - progress) * .55, width: 1.5 * scale.factor });
        }
      }
    }
  }
  destroy(): void { this.container.destroy(); }
}
