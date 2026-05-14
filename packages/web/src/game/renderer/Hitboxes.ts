import { Container, Graphics } from 'pixi.js';
import {
  GOAL,
  GOAL_OPENING,
  GOAL_HITBOX_MARGIN,
  GOALIE_HITBOX_EXPAND,
  type GoalieState,
} from '@hockey/game-core';
import type { Scale } from '../coords.js';

// Дебаг-оверлей реальных хитбоксов из @hockey/game-core/shot/resolve.ts:
// — створ ворот (опеннинг), внутри которого засчитывается гол; двигается с
//   goalOffsetX каждый кадр.
// — AABB вратаря (goalieState.width × .height), внутри которого засчитывается сейв.
const GOAL_COLOR = 0x22cc66;
const GOALIE_COLOR = 0xff3344;
const LINE_WIDTH = 2;

export interface HitboxesOptions {
  goalVisualYScale?: number | undefined;
  goalVisualYOffset?: number | undefined;
  goalVisualOffsetXScale?: number | undefined;
  goalWidthScale?: number | undefined;
  goalHeightScale?: number | undefined;
  goalInset?: number | undefined;
  goalieVisualYScale?: number | undefined;
  goalieVisualYOffset?: number | undefined;
  goalieVisualXScale?: number | undefined;
  goalieVisualXCenter?: number | undefined;
  goalieVisualMinX?: number | undefined;
  goalieVisualMaxX?: number | undefined;
  goalieWidthScale?: number | undefined;
  goalieHeightScale?: number | undefined;
  goalieInset?: number | undefined;
}

export class Hitboxes {
  readonly container = new Container();
  private readonly goalRect = new Graphics();
  private readonly goalieRect = new Graphics();
  private readonly goalVisualYScale: number;
  private readonly goalVisualYOffset: number;
  private readonly goalVisualOffsetXScale: number;
  private readonly goalWidthScale: number;
  private readonly goalHeightScale: number;
  private readonly goalInset: number;
  private readonly goalieVisualYScale: number;
  private readonly goalieVisualYOffset: number;
  private readonly goalieVisualXScale: number;
  private readonly goalieVisualXCenter: number;
  private readonly goalieVisualMinX: number | undefined;
  private readonly goalieVisualMaxX: number | undefined;
  private readonly goalieWidthScale: number;
  private readonly goalieHeightScale: number;
  private readonly goalieInset: number;
  private destroyed = false;

  constructor(options: HitboxesOptions = {}) {
    this.goalVisualYScale = options.goalVisualYScale ?? 1;
    this.goalVisualYOffset = options.goalVisualYOffset ?? 0;
    this.goalVisualOffsetXScale = options.goalVisualOffsetXScale ?? 1;
    this.goalWidthScale = options.goalWidthScale ?? 1;
    this.goalHeightScale = options.goalHeightScale ?? 1;
    this.goalInset = options.goalInset ?? 0;
    this.goalieVisualYScale = options.goalieVisualYScale ?? 1;
    this.goalieVisualYOffset = options.goalieVisualYOffset ?? 0;
    this.goalieVisualXScale = options.goalieVisualXScale ?? 1;
    this.goalieVisualXCenter = options.goalieVisualXCenter ?? 286;
    this.goalieVisualMinX = options.goalieVisualMinX;
    this.goalieVisualMaxX = options.goalieVisualMaxX;
    this.goalieWidthScale = options.goalieWidthScale ?? 1;
    this.goalieHeightScale = options.goalieHeightScale ?? 1;
    this.goalieInset = options.goalieInset ?? 0;
    this.container.addChild(this.goalRect);
    this.container.addChild(this.goalieRect);
    this.container.visible = false;
  }

  setVisible(visible: boolean): void {
    if (this.destroyed) return;
    this.container.visible = visible;
  }

  update(scale: Scale, goalOffsetX: number, goalieState: GoalieState): void {
    if (this.destroyed) return;
    if (!this.container.visible) return;
    const s = scale.factor;
    const visualGoalOffsetX = goalOffsetX * this.goalVisualOffsetXScale;

    const openingCenterX = (GOAL_OPENING.xMin + GOAL_OPENING.xMax) / 2 + visualGoalOffsetX;
    const openingWidth = Math.max(
      0,
      (GOAL_OPENING.xMax - GOAL_HITBOX_MARGIN - (GOAL_OPENING.xMin + GOAL_HITBOX_MARGIN)) *
        this.goalWidthScale -
        this.goalInset * 2,
    );
    const openingXMin = (openingCenterX - openingWidth / 2) * s;
    const openingXMax = (openingCenterX + openingWidth / 2) * s;
    const goalCenterY = ((GOAL.y + GOAL_OPENING.y) / 2) * this.goalVisualYScale;
    const goalHeight = Math.max(
      0,
      (GOAL_OPENING.y - GOAL.y) * this.goalVisualYScale * this.goalHeightScale -
        this.goalInset * 2,
    );
    const yTop = (goalCenterY + this.goalVisualYOffset - goalHeight / 2) * s;
    const yBot = (goalCenterY + this.goalVisualYOffset + goalHeight / 2) * s;
    this.goalRect
      .clear()
      .rect(openingXMin, yTop, openingXMax - openingXMin, yBot - yTop)
      .stroke({ width: LINE_WIDTH, color: GOAL_COLOR });

    const gw =
      Math.max(0, (goalieState.width + GOALIE_HITBOX_EXPAND) * this.goalieWidthScale - this.goalieInset * 2) *
      s;
    const gh =
      Math.max(
        0,
        goalieState.height * this.goalieVisualYScale * this.goalieHeightScale -
          this.goalieInset * 2,
      ) * s;
    const scaledGoalieX =
      this.goalieVisualXCenter +
      (goalieState.position.x - this.goalieVisualXCenter) * this.goalieVisualXScale;
    const visualGoalieX = Math.max(
      this.goalieVisualMinX ?? -Infinity,
      Math.min(this.goalieVisualMaxX ?? Infinity, scaledGoalieX),
    );
    const gx =
      (visualGoalieX -
        ((goalieState.width + GOALIE_HITBOX_EXPAND) * this.goalieWidthScale) / 2) *
      s;
    const gy =
      (goalieState.position.y * this.goalieVisualYScale + this.goalieVisualYOffset) * s - gh / 2;
    this.goalieRect.clear().rect(gx, gy, gw, gh).stroke({ width: LINE_WIDTH, color: GOALIE_COLOR });

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
