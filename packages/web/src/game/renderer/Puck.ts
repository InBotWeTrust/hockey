import { Container, Graphics } from 'pixi.js';
import { PUCK_START, type Vec2 } from '@hockey/game-core';
import type { Scale } from '../coords.js';

const PUCK_RADIUS = 3.3;
const PUCK_BLACK = 0x111111;

// Puck sits at the blade toe, offset from the body centre.
// Left grip carries the puck on the left side of the body (negative x),
// right grip — on the right (positive x). Y is the same: puck is in front.
// Offset +10% вслед за ростом sprite игрока, чтобы шайба оставалась на
// кончике клюшки.
export const BLADE_OFFSET: Record<'left' | 'right', Vec2> = {
  left: { x: -13, y: -33 },
  right: { x: 13, y: -33 },
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
  private held: Vec2 | null = null;
  private destroyed = false;

  constructor(grip: 'left' | 'right' = 'left') {
    this.offset = BLADE_OFFSET[grip];
    this.container.addChild(this.shadow);
    this.container.addChild(this.body);
  }

  bladePoint(shooterX: number): Vec2 {
    return { x: shooterX + this.offset.x, y: PUCK_START.y + this.offset.y };
  }

  resetAtStart(scale: Scale, shooterX = PUCK_START.x): void {
    if (this.destroyed) return;
    this.flight = null;
    this.draw(this.bladePoint(shooterX), scale);
  }

  playShot(start: Vec2, end: Vec2, now: number, durationMs = 300): void {
    if (this.destroyed) return;
    this.flight = { start, end, startedAt: now, durationMs };
  }

  holdAt(pos: Vec2): void {
    if (this.destroyed) return;
    this.held = pos;
    this.flight = null;
  }

  release(): void {
    if (this.destroyed) return;
    this.held = null;
  }

  update(now: number, scale: Scale): void {
    if (this.destroyed) return;
    if (this.held) {
      this.draw(this.held, scale);
      return;
    }
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

  isHeld(): boolean {
    return this.held !== null;
  }

  private draw(p: Vec2, scale: Scale): void {
    const r = PUCK_RADIUS * scale.factor;
    this.shadow.clear();
    this.body.clear();
    this.body.circle(0, 0, r).fill(PUCK_BLACK);

    this.container.position.set(
      p.x * scale.factor + scale.offsetX,
      p.y * scale.factor + scale.offsetY,
    );
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
