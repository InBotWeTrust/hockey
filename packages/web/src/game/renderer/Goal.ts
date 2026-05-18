import { Assets, BlurFilter, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { GOAL } from '@hockey/game-core';
import type { Scale } from '../coords.js';

// gate.webp: 640×344, aspect 1.86:1 — +10% сверх предыдущих 90×48.
const GATE_W = 99;
const GATE_H = 53; // 99 / 1.86

const LIGHT_DURATION_MS = 900;
const LIGHT_PEAK_ALPHA = 0.4;

export interface GoalOptions {
  spriteUrl?: string | undefined;
  gateWidth?: number | undefined;
  gateAspect?: number | undefined;
  visualYScale?: number | undefined;
  visualYOffset?: number | undefined;
  visualOffsetXScale?: number | undefined;
  visualMaxOffsetX?: number | undefined;
  spriteAnchorY?: number | undefined;
}

export class Goal {
  readonly container = new Container();
  private readonly light: Graphics;
  private readonly sprite: Sprite;
  private readonly gateWidth: number;
  private readonly gateHeight: number;
  private readonly visualYScale: number;
  private readonly visualYOffset: number;
  private readonly visualOffsetXScale: number;
  private readonly visualMaxOffsetX: number | undefined;
  private lightStartedAt: number | null = null;
  private destroyed = false;

  constructor(options: GoalOptions = {}) {
    this.gateWidth = options.gateWidth ?? GATE_W;
    this.gateHeight = this.gateWidth / (options.gateAspect ?? GATE_W / GATE_H);
    this.visualYScale = options.visualYScale ?? 1;
    this.visualYOffset = options.visualYOffset ?? 0;
    this.visualOffsetXScale = options.visualOffsetXScale ?? 1;
    this.visualMaxOffsetX = options.visualMaxOffsetX;
    this.light = new Graphics()
      .ellipse(0, 0, this.gateWidth * 0.36, this.gateHeight * 0.55)
      .fill({ color: 0xff1a1a });
    this.light.filters = [new BlurFilter({ strength: 14 })];
    this.light.alpha = 0;

    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.anchor.set(0.5, options.spriteAnchorY ?? 0.5);
    Assets.load<Texture>(options.spriteUrl ?? '/sprites/gate.webp')
      .then((tex) => {
        if (this.destroyed) return;
        this.sprite.texture = tex;
      })
      .catch(() => undefined);

    // light renders behind the gate sprite
    this.container.addChild(this.light);
    this.container.addChild(this.sprite);
  }

  triggerGoalLight(): void {
    if (this.destroyed) return;
    this.lightStartedAt = performance.now();
  }

  update(scale: Scale, offsetRinkX = 0, offsetRinkY = 0): void {
    if (this.destroyed) return;
    const s = scale.factor;
    this.sprite.width = this.gateWidth * s;
    this.sprite.height = this.gateHeight * s;
    const scaledOffsetX = offsetRinkX * this.visualOffsetXScale;
    const visualOffsetX =
      this.visualMaxOffsetX === undefined
        ? scaledOffsetX
        : Math.max(-this.visualMaxOffsetX, Math.min(this.visualMaxOffsetX, scaledOffsetX));
    const rawX = GOAL.x + GOAL.width / 2 + visualOffsetX;
    const goalLineY =
      (GOAL.y + GOAL.height + offsetRinkY) * this.visualYScale + this.visualYOffset;
    const cx = rawX * s;
    const cy = goalLineY * s;
    this.sprite.position.set(cx, cy);
    // Light sits behind the net, closer to the back bar than to the ice in front.
    this.light.position.set(
      cx,
      ((GOAL.y + offsetRinkY) * this.visualYScale +
        this.visualYOffset -
        this.gateHeight * 0.52) *
        s,
    );
    this.light.scale.set(s);
    this.container.position.set(scale.offsetX, scale.offsetY);

    if (this.lightStartedAt !== null) {
      const t = (performance.now() - this.lightStartedAt) / LIGHT_DURATION_MS;
      if (t >= 1) {
        this.light.alpha = 0;
        this.lightStartedAt = null;
      } else {
        // fast fade-in (0→0.2), hold (0.2→0.6), fade-out (0.6→1.0)
        const a = t < 0.2 ? t / 0.2 : t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
        this.light.alpha = a * LIGHT_PEAK_ALPHA;
      }
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
