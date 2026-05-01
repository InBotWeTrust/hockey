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
const GOAL_COLOR = 0xff3344;
const GOALIE_COLOR = 0x22cc66;
const LINE_WIDTH = 2;

export class Hitboxes {
  readonly container = new Container();
  private readonly goalRect = new Graphics();
  private readonly goalieRect = new Graphics();
  private destroyed = false;

  constructor() {
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

    const openingXMin = (GOAL_OPENING.xMin + goalOffsetX + GOAL_HITBOX_MARGIN) * s;
    const openingXMax = (GOAL_OPENING.xMax + goalOffsetX - GOAL_HITBOX_MARGIN) * s;
    const yTop = GOAL.y * s;
    const yBot = GOAL_OPENING.y * s;
    this.goalRect
      .clear()
      .rect(openingXMin, yTop, openingXMax - openingXMin, yBot - yTop)
      .stroke({ width: LINE_WIDTH, color: GOAL_COLOR });

    const gw = (goalieState.width + GOALIE_HITBOX_EXPAND) * s;
    const gh = goalieState.height * s;
    const gx = (goalieState.position.x - (goalieState.width + GOALIE_HITBOX_EXPAND) / 2) * s;
    const gy = (goalieState.position.y - goalieState.height / 2) * s;
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
