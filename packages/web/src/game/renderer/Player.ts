import { Container, Sprite } from 'pixi.js';
import { PUCK_START } from '@hockey/game-core';
import type { Scale } from '../coords.js';

// player.png: body is upper-right, stick goes lower-left
// Blade/hook is at ~15% from left, ~82% from top of the square image
const SPRITE_SIZE = 80;
const BLADE_ANCHOR_X = 0.15;
const BLADE_ANCHOR_Y = 0.82;

export class Player {
  readonly container = new Container();
  private readonly sprite: Sprite;

  constructor() {
    this.sprite = Sprite.from('/sprites/player.png');
    this.sprite.anchor.set(BLADE_ANCHOR_X, BLADE_ANCHOR_Y);
    this.container.addChild(this.sprite);
  }

  update(scale: Scale, shooterX = PUCK_START.x): void {
    const s = scale.factor;
    const size = SPRITE_SIZE * s;
    this.sprite.width = size;
    this.sprite.height = size;
    // Position the anchor (blade) at the puck's resting position
    this.sprite.position.set(shooterX * s, PUCK_START.y * s);
    this.container.position.set(scale.offsetX, scale.offsetY);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
