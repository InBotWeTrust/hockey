import { Assets, BlurFilter, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { type GoalieState } from '@hockey/game-core';
import type { Scale } from '../coords.js';

// goalkeeper.webp / save.webp: 1024×1024 square. Save-поза в отдельном
// файле с раскинутыми щитками визуально не заполняет кадр так плотно, как
// idle-спрайт, поэтому рисуем её крупнее, чтобы фигура совпадала.
// +10% сверх предыдущих 63/80.
const IDLE_SIZE = 69;
const SAVE_SIZE = 88;

export interface GoalieOptions {
  idleSpriteUrl?: string | undefined;
  saveSpriteUrl?: string | undefined;
  visualYScale?: number | undefined;
  visualYOffset?: number | undefined;
  visualXScale?: number | undefined;
  visualXCenter?: number | undefined;
  visualMinX?: number | undefined;
  visualMaxX?: number | undefined;
  sizeScale?: number | undefined;
  idleSizeScale?: number | undefined;
  saveSizeScale?: number | undefined;
  saveVisualYOffset?: number | undefined;
  shadow?: boolean | undefined;
}

export class Goalie {
  readonly container = new Container();
  private readonly shadow: Graphics | null;
  private readonly sprite: Sprite;
  private readonly visualYScale: number;
  private readonly visualYOffset: number;
  private readonly visualXScale: number;
  private readonly visualXCenter: number;
  private readonly visualMinX: number | undefined;
  private readonly visualMaxX: number | undefined;
  private readonly sizeScale: number;
  private readonly idleSizeScale: number;
  private readonly saveSizeScale: number;
  private readonly saveVisualYOffset: number;
  private idleTex: Texture = Texture.EMPTY;
  private saveTex: Texture = Texture.EMPTY;
  private isSaving = false;
  private destroyed = false;

  constructor(options: GoalieOptions = {}) {
    this.visualYScale = options.visualYScale ?? 1;
    this.visualYOffset = options.visualYOffset ?? 0;
    this.visualXScale = options.visualXScale ?? 1;
    this.visualXCenter = options.visualXCenter ?? 286;
    this.visualMinX = options.visualMinX;
    this.visualMaxX = options.visualMaxX;
    this.sizeScale = options.sizeScale ?? 1;
    this.idleSizeScale = options.idleSizeScale ?? 1;
    this.saveSizeScale = options.saveSizeScale ?? 1;
    this.saveVisualYOffset = options.saveVisualYOffset ?? 0;
    this.shadow = options.shadow
      ? new Graphics().ellipse(0, 0, 1, 1).fill({ color: 0x0c1b2d, alpha: 0.2 })
      : null;
    if (this.shadow) {
      this.shadow.filters = [new BlurFilter({ strength: 8 })];
      this.container.addChild(this.shadow);
    }
    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.anchor.set(0.5, 0.5);
    this.container.addChild(this.sprite);
    Assets.load<Texture>(options.idleSpriteUrl ?? '/sprites/goalkeeper.webp')
      .then((tex) => {
        if (this.destroyed) return;
        this.idleTex = tex;
        if (!this.isSaving) this.sprite.texture = tex;
      })
      .catch(() => undefined);
    Assets.load<Texture>(options.saveSpriteUrl ?? '/sprites/save.webp')
      .then((tex) => {
        if (this.destroyed) return;
        this.saveTex = tex;
        if (this.isSaving) this.sprite.texture = tex;
      })
      .catch(() => undefined);
  }

  setSavePose(saving: boolean): void {
    if (this.destroyed) return;
    this.isSaving = saving;
    const tex = saving ? this.saveTex : this.idleTex;
    if (tex !== Texture.EMPTY) this.sprite.texture = tex;
  }

  update(state: GoalieState, scale: Scale): void {
    if (this.destroyed) return;
    const s = scale.factor;
    const size =
      (this.isSaving ? SAVE_SIZE * this.saveSizeScale : IDLE_SIZE * this.idleSizeScale) *
      this.sizeScale *
      s;
    this.sprite.width = size;
    this.sprite.height = size;
    // Без визуального clamp — диапазон движения задан patterns.ts /
    // game-core. Дополнительный clamp здесь создавал плато у бортов.
    const scaledX =
      this.visualXCenter + (state.position.x - this.visualXCenter) * this.visualXScale;
    const x = Math.max(
      this.visualMinX ?? -Infinity,
      Math.min(this.visualMaxX ?? Infinity, scaledX),
    );
    const poseYOffset = this.isSaving ? this.saveVisualYOffset : 0;
    this.sprite.position.set(
      x * s,
      (state.position.y * this.visualYScale + this.visualYOffset + poseYOffset) * s,
    );
    if (this.shadow) {
      this.shadow.clear();
      this.shadow
        .ellipse(0, 0, size * (this.isSaving ? 0.4 : 0.34), size * 0.09)
        .fill({ color: 0x0c1b2d, alpha: this.isSaving ? 0.18 : 0.2 });
      this.shadow.position.set(this.sprite.position.x, this.sprite.position.y + size * 0.3);
    }
    this.container.position.set(scale.offsetX, scale.offsetY);
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
