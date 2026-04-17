import { Container, Graphics } from 'pixi.js';
import { RINK } from '@hockey/game-core';
import type { Scale } from '../coords.js';

export class Rink {
  readonly container = new Container();
  private readonly bg = new Graphics();
  private readonly centerLine = new Graphics();

  constructor() {
    this.container.addChild(this.bg);
    this.container.addChild(this.centerLine);
  }

  update(scale: Scale): void {
    const w = RINK.width * scale.factor;
    const h = RINK.height * scale.factor;

    this.bg.clear();
    this.bg
      .roundRect(0, 0, w, h, 24 * scale.factor)
      .fill(0xe6f1ff)
      .stroke({ color: 0x6aa7ff, width: 2 * scale.factor });

    this.centerLine.clear();
    this.centerLine
      .moveTo(0, h / 2)
      .lineTo(w, h / 2)
      .stroke({ color: 0xff5a5a, width: 2 * scale.factor });

    this.container.position.set(scale.offsetX, scale.offsetY);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
