import { Container, Graphics } from 'pixi.js';
import { RINK, GOAL } from '@hockey/game-core';
import type { Scale } from '../coords.js';

const BORDER      = 0x1a3d8c;
const ICE         = 0xe8f2ff;
const ICE_INNER   = 0xf4f9ff;
const GOAL_LINE   = 0xdd2222;
const BLUE_LINE   = 0x2266cc;
const RED_LINE    = 0xdd2222;
const FACEOFF     = 0xdd2222;
const CENTER_C    = 0x2266cc;
const CREASE_FILL = 0xc2daf5;
const CREASE_STR  = 0x2266cc;

export class Rink {
  readonly container = new Container();
  private readonly bg       = new Graphics();
  private readonly markings = new Graphics();

  constructor() {
    this.container.addChild(this.bg);
    this.container.addChild(this.markings);
  }

  update(scale: Scale): void {
    const s  = scale.factor;
    const w  = RINK.width  * s;
    const h  = RINK.height * s;
    const cr = 32 * s; // corner radius
    const bw = 7  * s; // border width

    // ── Background ──────────────────────────────────────────────────────────
    this.bg.clear();

    // Thick dark-blue border
    this.bg.roundRect(0, 0, w, h, cr).fill(BORDER);

    // Ice gradient: slightly blue outer ring → near-white center
    this.bg.roundRect(bw, bw, w - 2 * bw, h - 2 * bw, cr - bw).fill(ICE);
    this.bg.roundRect(bw * 3, bw * 3, w - 6 * bw, h - 6 * bw, cr - bw * 3).fill(ICE_INNER);

    // ── Markings ────────────────────────────────────────────────────────────
    this.markings.clear();

    const cx = w / 2;
    const goalCx = (GOAL.x + GOAL.width / 2) * s;

    // — Top goal crease —
    const creaseR = 48 * s;
    const creaseY = (GOAL.y + GOAL.height) * s;
    this.markings
      .moveTo(goalCx - creaseR, creaseY)
      .arc(goalCx, creaseY, creaseR, Math.PI, 0)
      .closePath()
      .fill({ color: CREASE_FILL, alpha: 0.85 })
      .stroke({ color: CREASE_STR, width: 1.5 * s });

    // — Top goal line —
    const goalLineY = (GOAL.y + GOAL.height + 3) * s;
    this.markings
      .moveTo(bw * 1.5, goalLineY)
      .lineTo(w - bw * 1.5, goalLineY)
      .stroke({ color: GOAL_LINE, width: 2 * s });

    // — Bottom goal crease & goal line (symmetric) —
    const bCreaseY = h - creaseY;
    this.markings
      .moveTo(goalCx - creaseR, bCreaseY)
      .arc(goalCx, bCreaseY, creaseR, 0, Math.PI)
      .closePath()
      .fill({ color: CREASE_FILL, alpha: 0.85 })
      .stroke({ color: CREASE_STR, width: 1.5 * s });

    const bGoalLineY = h - goalLineY;
    this.markings
      .moveTo(bw * 1.5, bGoalLineY)
      .lineTo(w - bw * 1.5, bGoalLineY)
      .stroke({ color: GOAL_LINE, width: 2 * s });

    // — Blue lines —
    const bl1 = h * 0.355;
    const bl2 = h * 0.645;
    for (const ly of [bl1, bl2]) {
      this.markings
        .moveTo(0, ly).lineTo(w, ly)
        .stroke({ color: BLUE_LINE, width: 4.5 * s });
    }

    // — Center red line —
    const cy = h / 2;
    this.markings
      .moveTo(0, cy).lineTo(w, cy)
      .stroke({ color: RED_LINE, width: 3 * s });

    // — Center circle (blue) + dot —
    const centerR = 50 * s;
    this.markings
      .circle(cx, cy, centerR)
      .stroke({ color: CENTER_C, width: 2 * s });
    this.markings
      .circle(cx, cy, 3.5 * s)
      .fill(CENTER_C);

    // — Neutral zone faceoff dots —
    const nzDots: Array<[number, number]> = [
      [w * 0.25, bl1 + 15 * s],
      [w * 0.75, bl1 + 15 * s],
      [w * 0.25, bl2 - 15 * s],
      [w * 0.75, bl2 - 15 * s],
    ];
    for (const [dx, dy] of nzDots) {
      this.markings.circle(dx, dy, 4 * s).fill(FACEOFF);
    }

    // — Zone faceoff circles with crosshair hash marks —
    const zoneR = 52 * s;
    const zones: Array<[number, number]> = [
      [w * 0.27, h * 0.20],
      [w * 0.73, h * 0.20],
      [w * 0.27, h * 0.74],
      [w * 0.73, h * 0.74],
    ];

    for (const [fcx, fcy] of zones) {
      // Outer circle
      this.markings
        .circle(fcx, fcy, zoneR)
        .stroke({ color: FACEOFF, width: 2 * s });

      // Center dot
      this.markings
        .circle(fcx, fcy, 3.5 * s)
        .fill(FACEOFF);

      // Short crosshair lines inside circle (~60% radius length)
      const arm = zoneR * 0.55;
      this.markings
        .moveTo(fcx - arm, fcy).lineTo(fcx + arm, fcy)
        .stroke({ color: FACEOFF, width: 1.5 * s });
      this.markings
        .moveTo(fcx, fcy - arm).lineTo(fcx, fcy + arm)
        .stroke({ color: FACEOFF, width: 1.5 * s });

      // Hash marks on left & right circle edge
      const tickH = 7 * s;
      const tickW = 5 * s;
      for (const side of [-1, 1]) {
        const tx = fcx + side * zoneR;
        // Tick extending inward
        this.markings
          .moveTo(tx, fcy - tickH)
          .lineTo(tx, fcy + tickH)
          .stroke({ color: FACEOFF, width: 2.5 * s });
        // Short horizontal stub outward
        this.markings
          .moveTo(tx, fcy - tickH)
          .lineTo(tx + side * tickW, fcy - tickH)
          .stroke({ color: FACEOFF, width: 2 * s });
        this.markings
          .moveTo(tx, fcy + tickH)
          .lineTo(tx + side * tickW, fcy + tickH)
          .stroke({ color: FACEOFF, width: 2 * s });
      }
    }

    this.container.position.set(scale.offsetX, scale.offsetY);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
