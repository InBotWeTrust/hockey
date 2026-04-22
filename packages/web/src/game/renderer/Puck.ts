import { Container, Graphics } from 'pixi.js';
import { PUCK_START, type Vec2 } from '@hockey/game-core';
import type { Scale } from '../coords.js';

const PUCK_RADIUS = 6;
const PUCK_BLACK = 0x0b0b0b;
const PUCK_OUTLINE = 0xe23636;
const PUCK_HIGHLIGHT = 0x2a2a2a;

export class Puck {
  readonly container = new Container();
  private readonly shadow = new Graphics();
  private readonly body = new Graphics();
  private flight: {
    start: Vec2;
    end: Vec2;
    startedAt: number;
    durationMs: number;
  } | null = null;

  constructor() {
    this.container.addChild(this.shadow);
    this.container.addChild(this.body);
  }

  resetAtStart(scale: Scale, shooterX = PUCK_START.x): void {
    this.flight = null;
    this.draw({ x: shooterX, y: PUCK_START.y }, scale);
  }

  playShot(start: Vec2, end: Vec2, now: number, durationMs = 300): void {
    this.flight = { start, end, startedAt: now, durationMs };
  }

  update(now: number, scale: Scale): void {
    if (!this.flight) return;
    const t = Math.min(1, (now - this.flight.startedAt) / this.flight.durationMs);
    const x = this.flight.start.x + (this.flight.end.x - this.flight.start.x) * t;
    const y = this.flight.start.y + (this.flight.end.y - this.flight.start.y) * t;
    this.draw({ x, y }, scale);
    if (t >= 1) this.flight = null;
  }

  isFlying(): boolean {
    return this.flight !== null;
  }

  private draw(p: Vec2, scale: Scale): void {
    const r = PUCK_RADIUS * scale.factor;
    this.shadow.clear();
    this.shadow
      .ellipse(2 * scale.factor, 3 * scale.factor, r * 0.95, r * 0.45)
      .fill({ color: 0x0f172a, alpha: 0.35 });

    this.body.clear();
    this.body
      .circle(0, 0, r)
      .fill(PUCK_BLACK)
      .stroke({ color: PUCK_OUTLINE, width: 2 * scale.factor });
    this.body
      .circle(-r * 0.3, -r * 0.3, r * 0.35)
      .fill(PUCK_HIGHLIGHT);

    this.container.position.set(
      p.x * scale.factor + scale.offsetX,
      p.y * scale.factor + scale.offsetY,
    );
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
