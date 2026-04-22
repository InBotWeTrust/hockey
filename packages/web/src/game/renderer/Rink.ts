import { Container, Sprite } from 'pixi.js';
import { RINK } from '@hockey/game-core';
import type { Scale } from '../coords.js';

export class Rink {
  readonly container = new Container();
  private readonly bg = Sprite.from('/sprites/court.webp');

  constructor() {
    this.container.addChild(this.bg);
  }

  // court.webp natural aspect ratio (679/1280 ≈ 0.530); cover by height to avoid distortion
  private static readonly COURT_ASPECT = 679 / 1280;

  update(scale: Scale): void {
    const s = scale.factor;
    try {
      const rinkW = RINK.width  * s;
      const rinkH = RINK.height * s;
      const coverW = rinkH * Rink.COURT_ASPECT;
      this.bg.width  = coverW;
      this.bg.height = rinkH;
      this.bg.x = -(coverW - rinkW) / 2;
      this.container.position.set(scale.offsetX, scale.offsetY);
    } catch {
      // destroyed or texture not yet resolved (HMR edge case)
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
