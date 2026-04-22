import { Container, Sprite } from 'pixi.js';
import type { GoalieState } from '@hockey/game-core';
import type { Scale } from '../coords.js';

// goalkeeper.png: spread (arms+stick+pads) fills ~85% of 320px image
// 90 game units × 85% ≈ 76 units visible spread vs GOAL.width=90 — fills goal nicely
const SPRITE_SIZE = 90;

export class Goalie {
  readonly container = new Container();
  private readonly sprite: Sprite;

  constructor() {
    this.sprite = Sprite.from('/sprites/goalkeeper.png');
    this.sprite.anchor.set(0.5, 0.5);
    this.container.addChild(this.sprite);
  }

  update(state: GoalieState, scale: Scale, offsetRinkX = 0): void {
    const s = scale.factor;
    const size = SPRITE_SIZE * s;
    this.sprite.width = size;
    this.sprite.height = size;
    this.sprite.position.set(
      (state.position.x + offsetRinkX) * s,
      state.position.y * s,
    );
    this.container.position.set(scale.offsetX, scale.offsetY);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
