import { Container, Graphics } from 'pixi.js';
import { PUCK_START, type Vec2 } from '@hockey/game-core';
import type { Scale } from '../coords.js';

const PUCK_RADIUS = 3.3;
const PUCK_BLACK = 0x111111;
const PUCK_SHADOW = 0x0f172a;
const PUCK_TRAIL_OUTER = 0xd6dde8;
const PUCK_TRAIL_INNER = 0xb6c2d2;
const TRAIL_MAX_LENGTH = 154;
const TRAIL_MIN_DISTANCE = 1;

export interface PuckOptions {
  radiusScaleX?: number | undefined;
  radiusScaleY?: number | undefined;
  rotation?: number | undefined;
  visualYScale?: number | undefined;
  visualYOffset?: number | undefined;
  flightVisualYOffset?: number | undefined;
  bladeOffsetX?: number | undefined;
  bladeOffsetY?: number | undefined;
}

// Puck sits at the blade toe, offset from the body centre.
// Left grip carries the puck on the left side of the body (negative x),
// right grip — on the right (positive x). Y is the same: puck is in front.
// Keep the puck on the blade after the player sprite scale adjustment.
export const BLADE_OFFSET: Record<'left' | 'right', Vec2> = {
  left: { x: -13, y: -33 },
  right: { x: 13, y: -33 },
};

export class Puck {
  readonly container = new Container();
  private readonly trail = new Graphics();
  private readonly shadow = new Graphics();
  private readonly body = new Graphics();
  private readonly offset: Vec2;
  private readonly radiusScaleX: number;
  private readonly radiusScaleY: number;
  private readonly visualYScale: number;
  private readonly visualYOffset: number;
  private readonly flightVisualYOffset: number;
  private flight: {
    start: Vec2;
    end: Vec2;
    startedAt: number;
    durationMs: number;
    easing: 'linear' | 'ease-out';
    fullVisualOffset: boolean;
    waypoint?: {
      position: Vec2;
      progress: number;
    };
  } | null = null;
  private held: Vec2 | null = null;
  private destroyed = false;

  constructor(grip: 'left' | 'right' = 'right', options: PuckOptions = {}) {
    this.offset = BLADE_OFFSET[grip];
    if (options.bladeOffsetX !== undefined || options.bladeOffsetY !== undefined) {
      const gripDirection = grip === 'left' ? -1 : 1;
      this.offset = {
        x:
          options.bladeOffsetX !== undefined
            ? Math.abs(options.bladeOffsetX) * gripDirection
            : this.offset.x,
        y: options.bladeOffsetY ?? this.offset.y,
      };
    }
    this.radiusScaleX = options.radiusScaleX ?? 1;
    this.radiusScaleY = options.radiusScaleY ?? 1;
    this.visualYScale = options.visualYScale ?? 1;
    this.visualYOffset = options.visualYOffset ?? 0;
    this.flightVisualYOffset = options.flightVisualYOffset ?? 0;
    this.container.rotation = options.rotation ?? 0;
    this.container.addChild(this.trail);
    this.container.addChild(this.shadow);
    this.container.addChild(this.body);
  }

  bladePoint(shooterX: number): Vec2 {
    return { x: shooterX + this.offset.x, y: PUCK_START.y + this.offset.y };
  }

  shotPath(shooterX: number, targetY: number): { start: Vec2; end: Vec2 } {
    const start = this.bladePoint(shooterX);
    return {
      start,
      end: { x: shooterX, y: targetY },
    };
  }

  resetAtStart(scale: Scale, shooterX = PUCK_START.x): void {
    if (this.destroyed) return;
    this.flight = null;
    this.clearMotionEffects();
    this.draw(this.bladePoint(shooterX), scale);
  }

  playShot(start: Vec2, end: Vec2, now: number, durationMs = 300): void {
    if (this.destroyed) return;
    this.flight = {
      start,
      end,
      startedAt: now,
      durationMs,
      easing: 'linear',
      fullVisualOffset: false,
    };
  }

  playOutcomeMotion(
    start: Vec2,
    end: Vec2,
    now: number,
    durationMs: number,
    waypoint?: { position: Vec2; progress: number },
  ): void {
    if (this.destroyed) return;
    this.held = null;
    this.flight = {
      start,
      end,
      startedAt: now,
      durationMs,
      easing: 'ease-out',
      fullVisualOffset: true,
      ...(waypoint ? { waypoint } : {}),
    };
  }

  holdAt(pos: Vec2): void {
    if (this.destroyed) return;
    this.held = pos;
    this.flight = null;
    this.clearMotionEffects();
  }

  release(): void {
    if (this.destroyed) return;
    this.held = null;
    this.clearMotionEffects();
  }

  update(now: number, scale: Scale): void {
    if (this.destroyed) return;
    if (this.held) {
      this.draw(this.held, scale, this.flightVisualYOffset);
      return;
    }
    if (!this.flight) return;
    const progress = Math.min(
      1,
      Math.max(0, (now - this.flight.startedAt) / this.flight.durationMs),
    );
    const flight = this.flight;
    let segmentStart = flight.start;
    let segmentEnd = flight.end;
    let t = flight.easing === 'ease-out' ? 1 - (1 - progress) ** 2 : progress;
    if (flight.waypoint) {
      if (progress <= flight.waypoint.progress) {
        segmentEnd = flight.waypoint.position;
        t = flight.waypoint.progress === 0 ? 1 : progress / flight.waypoint.progress;
      } else {
        segmentStart = flight.waypoint.position;
        const reboundProgress =
          (progress - flight.waypoint.progress) / (1 - flight.waypoint.progress);
        t = 1 - (1 - reboundProgress) ** 2;
      }
    }
    const x = segmentStart.x + (segmentEnd.x - segmentStart.x) * t;
    const y = segmentStart.y + (segmentEnd.y - segmentStart.y) * t;
    this.draw(
      { x, y },
      scale,
      flight.fullVisualOffset ? this.flightVisualYOffset : this.flightVisualYOffset * t,
      progress >= 1 ? null : { start: segmentStart, progress },
    );
    if (progress >= 1) {
      this.held = flight.end;
      this.flight = null;
      this.clearMotionEffects();
    }
  }

  isFlying(): boolean {
    return this.flight !== null;
  }

  isHeld(): boolean {
    return this.held !== null;
  }

  private draw(
    p: Vec2,
    scale: Scale,
    extraVisualYOffset = 0,
    flightTrail: { start: Vec2; progress: number } | null = null,
  ): void {
    const rx = PUCK_RADIUS * scale.factor * this.radiusScaleX;
    const ry = PUCK_RADIUS * scale.factor * this.radiusScaleY;
    this.drawTrail(p, scale, flightTrail);
    this.shadow
      .clear()
      .ellipse(scale.factor * 0.8, scale.factor * 1.8, rx * 1.75, Math.max(1, ry * 0.7))
      .fill({ color: PUCK_SHADOW, alpha: flightTrail ? 0.2 : 0.12 });
    this.body.clear();
    this.body.ellipse(0, 0, rx, ry).fill(PUCK_BLACK);

    this.container.position.set(
      p.x * scale.factor + scale.offsetX,
      (p.y * this.visualYScale + this.visualYOffset + extraVisualYOffset) * scale.factor +
        scale.offsetY,
    );
  }

  private drawTrail(
    p: Vec2,
    scale: Scale,
    flightTrail: { start: Vec2; progress: number } | null,
  ): void {
    this.trail.clear();
    if (!flightTrail) return;

    const dx = (flightTrail.start.x - p.x) * scale.factor;
    const dy = (flightTrail.start.y - p.y) * this.visualYScale * scale.factor;
    const distance = Math.hypot(dx, dy);
    if (distance < TRAIL_MIN_DISTANCE) return;

    const length = Math.min(TRAIL_MAX_LENGTH * scale.factor, distance);
    const ux = dx / distance;
    const uy = dy / distance;
    const x = ux * length;
    const y = uy * length;
    const fade = Math.max(0.28, 1 - flightTrail.progress * 0.46);
    const width = Math.max(1.05, PUCK_RADIUS * scale.factor * 0.52);

    this.trail
      .moveTo(0, 0)
      .lineTo(x, y)
      .stroke({
        width: width * 1.7,
        color: PUCK_TRAIL_OUTER,
        alpha: 0.24 * fade,
      });
    this.trail
      .moveTo(0, 0)
      .lineTo(x * 0.9, y * 0.9)
      .stroke({
        width,
        color: PUCK_TRAIL_INNER,
        alpha: 0.42 * fade,
      });
  }

  private clearMotionEffects(): void {
    this.trail.clear();
    this.shadow.clear();
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
