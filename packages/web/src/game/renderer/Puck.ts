import { Container, Graphics } from 'pixi.js';
import { PUCK_START, type Vec2 } from '@hockey/game-core';
import type { Scale } from '../coords.js';

const PUCK_RADIUS = 3;
const PUCK_BLACK = 0x111111;

// Puck sits at the blade toe, offset from the body centre.
// Left grip carries the puck on the left side of the body (negative x),
// right grip — on the right (positive x). Y is the same: puck is in front.
export const BLADE_OFFSET: Record<'left' | 'right', Vec2> = {
  left:  { x: -17, y: -39 },
  right: { x:  17, y: -39 },
};

export class Puck {
  readonly container = new Container();
  private readonly shadow = new Graphics();
  private readonly body = new Graphics();
  private readonly offset: Vec2;
  private flight: {
    start: Vec2;
    end: Vec2;
    startedAt: number;
    durationMs: number;
  } | null = null;

  constructor(grip: 'left' | 'right' = 'left') {
    this.offset = BLADE_OFFSET[grip];
    this.container.addChild(this.shadow);
    this.container.addChild(this.body);
  }

  bladePoint(shooterX: number): Vec2 {
    return { x: shooterX + this.offset.x, y: PUCK_START.y + this.offset.y };
  }

  resetAtStart(scale: Scale, shooterX = PUCK_START.x): void {
    this.flight = null;
    this.draw(this.bladePoint(shooterX), scale);
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
    this.body.clear();
    this.body
      .circle(0, 0, r)
      .fill(PUCK_BLACK);

    this.container.position.set(
      p.x * scale.factor + scale.offsetX,
      p.y * scale.factor + scale.offsetY,
    );
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
