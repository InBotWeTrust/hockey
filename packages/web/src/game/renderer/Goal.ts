import { Container, Sprite } from 'pixi.js';
import { GOAL } from '@hockey/game-core';
import type { Scale } from '../coords.js';

// gate.png: goal structure fills ~85% of the square image
// 85% × 105 ≈ 89 ≈ GOAL.width — anchor centered at the goal mouth line
const SPRITE_SIZE = 105;

export class Goal {
  readonly container = new Container();
  private readonly sprite: Sprite;

  constructor() {
    this.sprite = Sprite.from('/sprites/gate.png');
    this.sprite.anchor.set(0.5, 0.5);
    this.container.addChild(this.sprite);
  }

  update(scale: Scale, offsetRinkX = 0): void {
    const s = scale.factor;
    const size = SPRITE_SIZE * s;
    this.sprite.width = size;
    this.sprite.height = size;
    this.sprite.position.set(
      (GOAL.x + GOAL.width / 2 + offsetRinkX) * s,
      (GOAL.y + GOAL.height) * s,
    );
    this.container.position.set(scale.offsetX, scale.offsetY);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
