import { Assets, Container, Sprite, Texture } from 'pixi.js';
import { type GoalieState } from '@hockey/game-core';
import type { Scale } from '../coords.js';

// goalkeeper.webp / save.webp: 1024×1024 square. Save-поза в отдельном
// файле с раскинутыми щитками визуально не заполняет кадр так плотно, как
// idle-спрайт, поэтому рисуем её крупнее, чтобы фигура совпадала.
// +10% сверх предыдущих 63/80.
const IDLE_SIZE = 69;
const SAVE_SIZE = 88;

export class Goalie {
  readonly container = new Container();
  private readonly sprite: Sprite;
  private idleTex: Texture = Texture.EMPTY;
  private saveTex: Texture = Texture.EMPTY;
  private isSaving = false;

  constructor() {
    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.anchor.set(0.5, 0.5);
    this.container.addChild(this.sprite);
    Assets.load<Texture>('/sprites/goalkeeper.webp').then((tex) => {
      this.idleTex = tex;
      if (!this.isSaving) this.sprite.texture = tex;
    });
    Assets.load<Texture>('/sprites/save.webp').then((tex) => {
      this.saveTex = tex;
      if (this.isSaving) this.sprite.texture = tex;
    });
  }

  setSavePose(saving: boolean): void {
    this.isSaving = saving;
    const tex = saving ? this.saveTex : this.idleTex;
    if (tex !== Texture.EMPTY) this.sprite.texture = tex;
  }

  update(state: GoalieState, scale: Scale): void {
    const s = scale.factor;
    const size = (this.isSaving ? SAVE_SIZE : IDLE_SIZE) * s;
    this.sprite.width = size;
    this.sprite.height = size;
    // Без визуального clamp — диапазон движения задан patterns.ts /
    // game-core. Дополнительный clamp здесь создавал плато у бортов.
    this.sprite.position.set(state.position.x * s, state.position.y * s);
    this.container.position.set(scale.offsetX, scale.offsetY);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
