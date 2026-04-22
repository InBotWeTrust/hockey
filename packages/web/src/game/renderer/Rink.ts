import { Container, Graphics } from 'pixi.js';
import { RINK, GOAL } from '@hockey/game-core';
import type { Scale } from '../coords.js';

const ICE = 0xffffff;
const RINK_BORDER = 0xd9e2ee;
const GOAL_LINE = 0xe23636;
const BLUE_LINE = 0x2b7bd6;
const CENTER_LINE = 0xe23636;
const FACEOFF = 0xe23636;
const CREASE_FILL = 0xdfecff;
const CREASE_STROKE = 0x2b7bd6;

export class Rink {
  readonly container = new Container();
  private readonly bg = new Graphics();
  private readonly lines = new Graphics();
  private readonly circles = new Graphics();
  private readonly crease = new Graphics();

  constructor() {
    this.container.addChild(this.bg);
    this.container.addChild(this.crease);
    this.container.addChild(this.lines);
    this.container.addChild(this.circles);
  }

  update(scale: Scale): void {
    const s = scale.factor;
    const w = RINK.width * s;
    const h = RINK.height * s;

    this.bg.clear();
    this.bg
      .roundRect(0, 0, w, h, 28 * s)
      .fill(ICE)
      .stroke({ color: RINK_BORDER, width: 2 * s });

    this.crease.clear();
    const creaseCx = (GOAL.x + GOAL.width / 2) * s;
    const creaseY = (GOAL.y + GOAL.height) * s;
    this.crease
      .moveTo(creaseCx - 60 * s, creaseY)
      .arc(creaseCx, creaseY, 60 * s, Math.PI, 0)
      .closePath()
      .fill(CREASE_FILL)
      .stroke({ color: CREASE_STROKE, width: 1.5 * s });

    this.lines.clear();
    const goalLineY = (GOAL.y + GOAL.height + 4) * s;
    this.lines
      .moveTo(12 * s, goalLineY)
      .lineTo(w - 12 * s, goalLineY)
      .stroke({ color: GOAL_LINE, width: 1.5 * s });

    this.lines
      .moveTo(0, h * 0.36)
      .lineTo(w, h * 0.36)
      .stroke({ color: BLUE_LINE, width: 3 * s });

    this.lines
      .moveTo(0, h / 2)
      .lineTo(w, h / 2)
      .stroke({ color: CENTER_LINE, width: 2 * s });

    this.circles.clear();
    this.circles
      .circle(w / 2, h / 2, 48 * s)
      .stroke({ color: BLUE_LINE, width: 1.5 * s })
      .circle(w / 2, h / 2, 3 * s)
      .fill(BLUE_LINE);

    const faceoffs: Array<[number, number]> = [
      [w * 0.22, h * 0.2],
      [w * 0.78, h * 0.2],
      [w * 0.22, h * 0.72],
      [w * 0.78, h * 0.72],
    ];
    for (const [cx, cy] of faceoffs) {
      this.circles
        .circle(cx, cy, 32 * s)
        .stroke({ color: FACEOFF, width: 1.5 * s })
        .circle(cx, cy, 3 * s)
        .fill(FACEOFF);
    }

    this.container.position.set(scale.offsetX, scale.offsetY);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
