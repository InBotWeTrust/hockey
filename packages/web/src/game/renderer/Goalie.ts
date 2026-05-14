import { Assets, Container, Sprite, Texture } from 'pixi.js';
import { type GoalieState } from '@hockey/game-core';
import type { Scale } from '../coords.js';

// goalkeeper.webp / save.webp: 1024×1024 square. Save-поза в отдельном
// файле с раскинутыми щитками визуально не заполняет кадр так плотно, как
// idle-спрайт, поэтому рисуем её крупнее, чтобы фигура совпадала.
// +10% сверх предыдущих 63/80.
const IDLE_SIZE = 69;
const SAVE_SIZE = 88;

export interface GoalieOptions {
  visualYScale?: number | undefined;
  visualYOffset?: number | undefined;
  visualXScale?: number | undefined;
  visualXCenter?: number | undefined;
  visualMinX?: number | undefined;
  visualMaxX?: number | undefined;
  sizeScale?: number | undefined;
}

export class Goalie {
  readonly container = new Container();
  private readonly sprite: Sprite;
  private readonly visualYScale: number;
  private readonly visualYOffset: number;
  private readonly visualXScale: number;
  private readonly visualXCenter: number;
  private readonly visualMinX: number | undefined;
  private readonly visualMaxX: number | undefined;
  private readonly sizeScale: number;
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
    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.anchor.set(0.5, 0.5);
    this.container.addChild(this.sprite);
    Assets.load<Texture>('/sprites/goalkeeper.webp')
      .then((tex) => {
        if (this.destroyed) return;
        this.idleTex = tex;
        if (!this.isSaving) this.sprite.texture = tex;
      })
      .catch(() => undefined);
    Assets.load<Texture>('/sprites/save.webp')
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
    const size = (this.isSaving ? SAVE_SIZE : IDLE_SIZE) * this.sizeScale * s;
    this.sprite.width = size;
    this.sprite.height = size;
    // Без визуального clamp — диапазон движения задан patterns.ts /
    // game-core. Дополнительный clamp здесь создавал плато у бортов.
    const scaledX = this.visualXCenter + (state.position.x - this.visualXCenter) * this.visualXScale;
    const x = Math.max(
      this.visualMinX ?? -Infinity,
      Math.min(this.visualMaxX ?? Infinity, scaledX),
    );
    this.sprite.position.set(x * s, (state.position.y * this.visualYScale + this.visualYOffset) * s);
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
