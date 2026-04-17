import { Container, Graphics } from 'pixi.js';
import { PUCK_START, type Vec2 } from '@hockey/game-core';
import type { Scale } from '../coords.js';

const PUCK_RADIUS = 8;

export class Puck {
  readonly container = new Container();
  private readonly body = new Graphics();
  private flight: {
    start: Vec2;
    end: Vec2;
    startedAt: number;
    durationMs: number;
  } | null = null;

  constructor() {
    this.container.addChild(this.body);
  }

  resetAtStart(scale: Scale): void {
    this.flight = null;
    this.draw(PUCK_START, scale);
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
    this.body.clear();
    this.body
      .circle(0, 0, PUCK_RADIUS * scale.factor)
      .fill(0x111111)
      .stroke({ color: 0xffffff, width: 1.5 * scale.factor });
    this.container.position.set(
      p.x * scale.factor + scale.offsetX,
      p.y * scale.factor + scale.offsetY,
    );
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
