import { Assets, Container, Sprite, Texture } from 'pixi.js';
import { PUCK_START } from '@hockey/game-core';
import type { Scale } from '../coords.js';

// lefthand/righthand.webp: 700×950 top-down view. Sprite centred at shooterX
// so the body oscillates symmetrically regardless of grip; the puck is
// offset from the body by Puck.BLADE_OFFSET. Width +10% сверх предыдущих 60.
const SPRITE_WIDTH = 66;
const SPRITE_ASPECT = 700 / 950;
const SPRITE_HEIGHT = SPRITE_WIDTH / SPRITE_ASPECT;

const SHOT_DURATION_MS = 240;
const BASE_ROTATION = 0.32; // resting "ready" pose, ~18.3 deg (opposite shot dir)
const SHOT_MAX = 0.24; // follow-through peak, ~13.7 deg

export class Player {
  readonly container = new Container();
  private readonly sprite: Sprite;
  private readonly shotDir: 1 | -1;
  private shotStartedAt: number | null = null;
  private destroyed = false;

  constructor(grip: 'left' | 'right' = 'left') {
    this.shotDir = grip === 'right' ? -1 : 1;
    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.anchor.set(0.5, 0.5);
    this.container.addChild(this.sprite);
    Assets.load<Texture>(`/sprites/${grip}hand.webp`)
      .then((tex) => {
        if (this.destroyed) return;
        this.sprite.texture = tex;
      })
      .catch(() => undefined);
  }

  playShot(): void {
    if (this.destroyed) return;
    this.shotStartedAt = performance.now();
  }

  update(scale: Scale, shooterX = PUCK_START.x, shooterY = PUCK_START.y): void {
    if (this.destroyed) return;
    const s = scale.factor;
    this.sprite.width = SPRITE_WIDTH * s;
    this.sprite.height = SPRITE_HEIGHT * s;
    this.sprite.position.set(shooterX * s, shooterY * s);
    this.container.position.set(scale.offsetX, scale.offsetY);

    if (this.shotStartedAt !== null) {
      const t = (performance.now() - this.shotStartedAt) / SHOT_DURATION_MS;
      if (t >= 1) {
        this.sprite.rotation = this.shotDir * -BASE_ROTATION;
        this.shotStartedAt = null;
      } else {
        // swing from base pose (-BASE) through peak (+MAX) and back to base (-BASE)
        let r: number;
        if (t < 0.35) {
          r = -BASE_ROTATION + (BASE_ROTATION + SHOT_MAX) * (t / 0.35);
        } else {
          r = SHOT_MAX - (SHOT_MAX + BASE_ROTATION) * ((t - 0.35) / 0.65);
        }
        this.sprite.rotation = this.shotDir * r;
      }
    } else {
      this.sprite.rotation = this.shotDir * -BASE_ROTATION;
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    try {
      this.container.destroy({ children: true });
    } catch {
      // Pixi may already have destroyed this through the parent stage.
    }
  }
}
