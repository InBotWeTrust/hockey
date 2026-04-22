import { Container, Sprite } from 'pixi.js';
import { RINK, type GoalieState } from '@hockey/game-core';
import type { Scale } from '../coords.js';

// goalkeeper.webp: 1024×1024 square
const SPRITE_SIZE = 55;
const HALF = SPRITE_SIZE / 2;
const INNER_MARGIN = 6; // matches rink border in game units

export class Goalie {
  readonly container = new Container();
  private readonly sprite: Sprite;

  constructor() {
    this.sprite = Sprite.from('/sprites/goalkeeper.webp');
    this.sprite.anchor.set(0.5, 0.5);
    this.container.addChild(this.sprite);
  }

  update(state: GoalieState, scale: Scale): void {
    const s = scale.factor;
    const size = SPRITE_SIZE * s;
    this.sprite.width = size;
    this.sprite.height = size;
    // Goalie moves independently of the goal — position is absolute, no goalOffset.
    const clampedX = Math.max(HALF + INNER_MARGIN, Math.min(RINK.width - HALF - INNER_MARGIN, state.position.x));
    this.sprite.position.set(
      Math.round(clampedX * s),
      Math.round(state.position.y * s),
    );
    this.container.position.set(Math.round(scale.offsetX), Math.round(scale.offsetY));
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
