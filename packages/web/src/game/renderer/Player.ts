import { Assets, Container, Sprite, Texture } from 'pixi.js';
import { PUCK_START } from '@hockey/game-core';
import type { Scale } from '../coords.js';

// lefthand/righthand.webp: 1024×1024 square, top-down view. Sprite centred
// at shooterX so the body oscillates symmetrically regardless of grip;
// the puck is offset from the body by Puck.BLADE_OFFSET.
const SPRITE_SIZE = 70;

export class Player {
  readonly container = new Container();
  private readonly sprite: Sprite;

  constructor(grip: 'left' | 'right' = 'left') {
    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.anchor.set(0.5, 0.5);
    this.container.addChild(this.sprite);
    Assets.load<Texture>(`/sprites/${grip}hand.webp`).then((tex) => {
      this.sprite.texture = tex;
    });
  }

  update(scale: Scale, shooterX = PUCK_START.x): void {
    const s = scale.factor;
    this.sprite.width  = SPRITE_SIZE * s;
    this.sprite.height = SPRITE_SIZE * s;
    this.sprite.position.set(Math.round(shooterX * s), Math.round(PUCK_START.y * s));
    this.container.position.set(Math.round(scale.offsetX), Math.round(scale.offsetY));
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
