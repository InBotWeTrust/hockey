import { Assets, BlurFilter, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { PUCK_START } from '@hockey/game-core';
import type { Scale } from '../coords.js';

// Sprite is centred at shooterX so the body oscillates symmetrically
// regardless of grip; the puck is offset from the body by Puck.BLADE_OFFSET.
const SPRITE_WIDTH = 66;
const SPRITE_ASPECT = 700 / 950;
const STUMBLE_SPRITE_ASPECT = 1130 / 1150;
const REST_SPRITE_ASPECT = 1000 / 1374;

const SHOT_DURATION_MS = 240;
const BASE_ROTATION = 0.32; // resting "ready" pose, ~18.3 deg (opposite shot dir)
const SHOT_MAX = 0.24; // follow-through peak, ~13.7 deg

export interface PlayerOptions {
  spriteUrl?: string | undefined;
  spriteUrls?: Partial<Record<'left' | 'right', string>> | undefined;
  shotSpriteUrl?: string | undefined;
  shotSpriteUrls?: Partial<Record<'left' | 'right', string>> | undefined;
  stumbleSpriteUrl?: string | undefined;
  stumbleSpriteUrls?: Partial<Record<'left' | 'right', string>> | undefined;
  restSpriteUrl?: string | undefined;
  restSpriteUrls?: Partial<Record<'left' | 'right', string>> | undefined;
  spriteWidth?: number | undefined;
  spriteAspect?: number | undefined;
  stumbleSpriteWidth?: number | undefined;
  stumbleSpriteAspect?: number | undefined;
  stumbleRotation?: number | undefined;
  restSpriteWidth?: number | undefined;
  restSpriteAspect?: number | undefined;
  restRotation?: number | undefined;
  fixedRotation?: number | undefined;
  baseRotation?: number | undefined;
  shotMaxRotation?: number | undefined;
  shotDurationMs?: number | undefined;
  visualYScale?: number | undefined;
  visualYOffset?: number | undefined;
  shadow?: boolean | undefined;
}

export class Player {
  readonly container = new Container();
  private readonly shadow: Graphics | null;
  private readonly sprite: Sprite;
  private readonly shotDir: 1 | -1;
  private readonly spriteWidth: number;
  private readonly spriteAspect: number;
  private readonly stumbleSpriteWidth: number;
  private readonly stumbleSpriteAspect: number;
  private readonly stumbleRotation: number;
  private readonly restSpriteWidth: number;
  private readonly restSpriteAspect: number;
  private readonly restRotation: number;
  private readonly fixedRotation: number | undefined;
  private readonly baseRotation: number;
  private readonly shotMaxRotation: number;
  private readonly shotDurationMs: number;
  private readonly visualYScale: number;
  private readonly visualYOffset: number;
  private idleTexture: Texture | null = null;
  private shotTexture: Texture | null = null;
  private stumbleTexture: Texture | null = null;
  private restTexture: Texture | null = null;
  private shotStartedAt: number | null = null;
  private destroyed = false;

  constructor(grip: 'left' | 'right' = 'right', options: PlayerOptions = {}) {
    this.shotDir = grip === 'right' ? -1 : 1;
    this.spriteWidth = options.spriteWidth ?? SPRITE_WIDTH;
    this.spriteAspect = options.spriteAspect ?? SPRITE_ASPECT;
    this.stumbleSpriteWidth = options.stumbleSpriteWidth ?? this.spriteWidth;
    this.stumbleSpriteAspect = options.stumbleSpriteAspect ?? STUMBLE_SPRITE_ASPECT;
    this.stumbleRotation = options.stumbleRotation ?? 0;
    this.restSpriteWidth = options.restSpriteWidth ?? this.spriteWidth;
    this.restSpriteAspect = options.restSpriteAspect ?? REST_SPRITE_ASPECT;
    this.restRotation = options.restRotation ?? 0;
    this.fixedRotation = options.fixedRotation;
    this.baseRotation = options.baseRotation ?? BASE_ROTATION;
    this.shotMaxRotation = options.shotMaxRotation ?? SHOT_MAX;
    this.shotDurationMs = options.shotDurationMs ?? SHOT_DURATION_MS;
    this.visualYScale = options.visualYScale ?? 1;
    this.visualYOffset = options.visualYOffset ?? 0;
    this.shadow = options.shadow
      ? new Graphics().ellipse(0, 0, 1, 1).fill({ color: 0x0c1b2d, alpha: 0.24 })
      : null;
    if (this.shadow) {
      this.shadow.filters = [new BlurFilter({ strength: 8 })];
      this.container.addChild(this.shadow);
    }
    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.anchor.set(0.5, 0.5);
    this.container.addChild(this.sprite);

    const idleSpriteUrl =
      options.spriteUrls?.[grip] ?? options.spriteUrl ?? `/sprites/${grip}hand.webp`;
    const shotSpriteUrl = options.shotSpriteUrls?.[grip] ?? options.shotSpriteUrl;
    const stumbleSpriteUrl = options.stumbleSpriteUrls?.[grip] ?? options.stumbleSpriteUrl;
    const restSpriteUrl = options.restSpriteUrls?.[grip] ?? options.restSpriteUrl;

    Assets.load<Texture>(idleSpriteUrl)
      .then((tex) => {
        if (this.destroyed) return;
        this.idleTexture = tex;
        this.sprite.texture = tex;
      })
      .catch(() => undefined);
    if (shotSpriteUrl) {
      Assets.load<Texture>(shotSpriteUrl)
        .then((tex) => {
          if (this.destroyed) return;
          this.shotTexture = tex;
        })
        .catch(() => undefined);
    }
    if (stumbleSpriteUrl) {
      Assets.load<Texture>(stumbleSpriteUrl)
        .then((tex) => {
          if (this.destroyed) return;
          this.stumbleTexture = tex;
        })
        .catch(() => undefined);
    }
    if (restSpriteUrl) {
      Assets.load<Texture>(restSpriteUrl)
        .then((tex) => {
          if (this.destroyed) return;
          this.restTexture = tex;
        })
        .catch(() => undefined);
    }
  }

  playShot(): void {
    if (this.destroyed) return;
    this.shotStartedAt = performance.now();
  }

  update(
    scale: Scale,
    shooterX = PUCK_START.x,
    shooterY = PUCK_START.y,
    options: { stumbling?: boolean | undefined; resting?: boolean | undefined } = {},
  ): void {
    if (this.destroyed) return;
    const s = scale.factor;
    const activeSpecialTexture =
      options.resting === true && this.restTexture !== null
        ? this.restTexture
        : options.stumbling === true && this.stumbleTexture !== null
          ? this.stumbleTexture
          : null;
    const useRestSprite = activeSpecialTexture !== null && activeSpecialTexture === this.restTexture;
    const useStumbleSprite =
      activeSpecialTexture !== null && activeSpecialTexture === this.stumbleTexture;
    const activeSpriteWidth = useRestSprite
      ? this.restSpriteWidth
      : useStumbleSprite
        ? this.stumbleSpriteWidth
        : this.spriteWidth;
    const activeSpriteAspect = useRestSprite
      ? this.restSpriteAspect
      : useStumbleSprite
        ? this.stumbleSpriteAspect
        : this.spriteAspect;
    if (activeSpecialTexture !== null && this.sprite.texture !== activeSpecialTexture) {
      this.sprite.texture = activeSpecialTexture;
    }
    this.sprite.width = activeSpriteWidth * s;
    this.sprite.height = (activeSpriteWidth / activeSpriteAspect) * s;
    this.sprite.position.set(shooterX * s, (shooterY * this.visualYScale + this.visualYOffset) * s);
    if (this.shadow) {
      this.shadow.clear();
      this.shadow
        .ellipse(0, 0, this.sprite.width * 0.28, this.sprite.width * 0.08)
        .fill({ color: 0x0c1b2d, alpha: 0.22 });
      this.shadow.position.set(
        this.sprite.position.x,
        this.sprite.position.y + this.sprite.height * 0.34,
      );
    }
    this.container.position.set(scale.offsetX, scale.offsetY);

    if (useRestSprite || useStumbleSprite) {
      this.shotStartedAt = null;
      this.sprite.rotation = useRestSprite ? this.restRotation : this.stumbleRotation;
      return;
    }

    if (this.fixedRotation !== undefined) {
      this.sprite.rotation = this.fixedRotation;
      return;
    }

    if (this.shotStartedAt !== null) {
      const t = (performance.now() - this.shotStartedAt) / this.shotDurationMs;
      if (t >= 1) {
        if (this.idleTexture && this.sprite.texture !== this.idleTexture) {
          this.sprite.texture = this.idleTexture;
        }
        this.sprite.rotation = this.shotDir * -this.baseRotation;
        this.shotStartedAt = null;
      } else {
        if (this.shotTexture && this.sprite.texture !== this.shotTexture) {
          this.sprite.texture = this.shotTexture;
        }
        // swing from base pose (-BASE) through peak (+MAX) and back to base (-BASE)
        let r: number;
        if (t < 0.35) {
          r = -this.baseRotation + (this.baseRotation + this.shotMaxRotation) * (t / 0.35);
        } else {
          r =
            this.shotMaxRotation - (this.shotMaxRotation + this.baseRotation) * ((t - 0.35) / 0.65);
        }
        this.sprite.rotation = this.shotDir * r;
      }
    } else {
      if (this.idleTexture && this.sprite.texture !== this.idleTexture) {
        this.sprite.texture = this.idleTexture;
      }
      this.sprite.rotation = this.shotDir * -this.baseRotation;
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
