import { Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { RINK } from '@hockey/game-core';
import type { Scale } from '../coords.js';
import {
  TRAINING_NEW_COURT_VISUAL_Y_OFFSET,
  TRAINING_NEW_COURT_VISUAL_Y_SCALE,
} from '../trainingNewCourt.js';

// Render size in rink coordinates before perspective depth scaling.
export const CAR_W = 136;
export const CAR_H = 205;

const X_LEFT = 34;
const X_RIGHT = RINK.width - 34;
const Y_TOP = 158;
const Y_BOTTOM = RINK.height - 82;
const OFFSCREEN_Y_TOP = Y_TOP - CAR_H * 0.68;
const OFFSCREEN_Y_BOTTOM = Y_BOTTOM + CAR_H * 0.78;

const N_STRIPS = 5;
const STRIP_W = Math.round((X_RIGHT - X_LEFT) / (N_STRIPS - 1));

const PASS_MS = 9400;
const TURN_MS = 1450;
const ENTRY_MS = 3900;
const RETURN_MS = 4600;

interface Seg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  ms: number;
  kind: 'pass' | 'turn';
}

type IceCarVariant = 'center' | 'left-down' | 'left-up' | 'right-down' | 'right-up';

type IceCarPose = {
  x: number;
  y: number;
  rot: number;
  variant: IceCarVariant;
};

const TEXTURE_URLS: Record<IceCarVariant, string> = {
  center: '/sprites/ice-resurfacer-center.webp',
  'left-down': '/sprites/ice-resurfacer-left-down.webp',
  'left-up': '/sprites/ice-resurfacer-left-up.webp',
  'right-down': '/sprites/ice-resurfacer-right-down.webp',
  'right-up': '/sprites/ice-resurfacer-right-up.webp',
};

function buildEntry(): Seg {
  return {
    x0: X_LEFT,
    y0: OFFSCREEN_Y_BOTTOM,
    x1: X_LEFT,
    y1: Y_TOP,
    ms: ENTRY_MS,
    kind: 'pass',
  };
}

function buildLoop(): Seg[] {
  const segs: Seg[] = [];

  for (let i = 0; i < N_STRIPS; i++) {
    const x = X_LEFT + i * STRIP_W;
    const goDown = i % 2 === 0;
    segs.push({
      x0: x,
      y0: goDown ? Y_TOP : Y_BOTTOM,
      x1: x,
      y1: goDown ? OFFSCREEN_Y_BOTTOM : OFFSCREEN_Y_TOP,
      ms: PASS_MS,
      kind: 'pass',
    });
    if (i < N_STRIPS - 1) {
      const turnY = goDown ? OFFSCREEN_Y_BOTTOM : OFFSCREEN_Y_TOP;
      segs.push({
        x0: x,
        y0: turnY,
        x1: x + STRIP_W,
        y1: turnY,
        ms: TURN_MS,
        kind: 'turn',
      });
      segs.push({
        x0: x + STRIP_W,
        y0: turnY,
        x1: x + STRIP_W,
        y1: goDown ? Y_BOTTOM : Y_TOP,
        ms: Math.round(TURN_MS * 0.72),
        kind: 'pass',
      });
    }
  }

  const lastX = X_LEFT + (N_STRIPS - 1) * STRIP_W;
  const lastGoesDown = (N_STRIPS - 1) % 2 === 0;
  const returnY = lastGoesDown ? OFFSCREEN_Y_BOTTOM : OFFSCREEN_Y_TOP;
  segs.push({
    x0: lastX,
    y0: returnY,
    x1: X_LEFT,
    y1: returnY,
    ms: RETURN_MS,
    kind: 'turn',
  });
  segs.push({
    x0: X_LEFT,
    y0: returnY,
    x1: X_LEFT,
    y1: lastGoesDown ? Y_TOP : Y_BOTTOM,
    ms: ENTRY_MS,
    kind: 'pass',
  });

  return segs;
}

const ENTRY = buildEntry();
const LOOP = buildLoop();
const RINK_CENTER_X = RINK.width / 2;
const PERSPECTIVE_TOP_SCALE = 0.96;
const PERSPECTIVE_BOTTOM_SCALE = 1.07;
const LOOP_CUM_STARTS: number[] = [];
let _cum = 0;
for (const seg of LOOP) {
  LOOP_CUM_STARTS.push(_cum);
  _cum += seg.ms;
}
const LOOP_MS = _cum;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function depthAt(y: number): number {
  return clamp01((y - Y_TOP) / (Y_BOTTOM - Y_TOP));
}

function perspectiveScaleAt(y: number): number {
  const depth = depthAt(y);
  return PERSPECTIVE_TOP_SCALE + (PERSPECTIVE_BOTTOM_SCALE - PERSPECTIVE_TOP_SCALE) * depth;
}

function variantFor(seg: Seg): IceCarVariant {
  const dx = seg.x1 - seg.x0;
  const dy = seg.y1 - seg.y0;
  if (Math.abs(dx) > Math.abs(dy)) return 'center';

  const laneCenter = (seg.x0 + seg.x1) / 2;
  const laneSide = (laneCenter - RINK_CENTER_X) / Math.max(1, X_RIGHT - RINK_CENTER_X);
  if (Math.abs(laneSide) < 0.18) return 'center';
  if (laneSide < 0) return dy > 0 ? 'left-down' : 'left-up';
  return dy > 0 ? 'right-down' : 'right-up';
}

function rotFor(seg: Seg, variant: IceCarVariant): number {
  const dx = seg.x1 - seg.x0;
  const dy = seg.y1 - seg.y0;
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? Math.PI / 2 : -Math.PI / 2;
  if (variant !== 'center') return 0;
  return dy > 0 ? 0 : Math.PI;
}

function posInSeg(seg: Seg, f: number): IceCarPose {
  const e = seg.kind === 'pass' ? easeInOut(f) : f;
  const variant = variantFor(seg);
  return {
    x: seg.x0 + (seg.x1 - seg.x0) * e,
    y: seg.y0 + (seg.y1 - seg.y0) * e,
    rot: rotFor(seg, variant),
    variant,
  };
}

export function iceCarPosAt(elapsed: number): IceCarPose {
  if (elapsed < ENTRY_MS) {
    return posInSeg(ENTRY, elapsed / ENTRY_MS);
  }

  const t = (((elapsed - ENTRY_MS) % LOOP_MS) + LOOP_MS) % LOOP_MS;
  for (let i = 0; i < LOOP.length; i++) {
    const seg = LOOP[i];
    const segStart = LOOP_CUM_STARTS[i] ?? 0;
    if (seg === undefined) break;
    if (t < segStart + seg.ms) {
      return posInSeg(seg, (t - segStart) / seg.ms);
    }
  }
  return { x: X_LEFT, y: Y_TOP, rot: 0, variant: 'left-down' };
}

export function perspectiveIceCarPose(pos: { x: number; y: number; rot: number }): {
  x: number;
  y: number;
  rot: number;
  size: number;
  depth: number;
} {
  const size = perspectiveScaleAt(pos.y);
  return {
    x: RINK_CENTER_X + (pos.x - RINK_CENTER_X) * size,
    y: pos.y * TRAINING_NEW_COURT_VISUAL_Y_SCALE + TRAINING_NEW_COURT_VISUAL_Y_OFFSET,
    rot: pos.rot,
    size,
    depth: depthAt(pos.y),
  };
}

export class IceCar {
  readonly container = new Container();
  private readonly shadow: Graphics;
  private readonly sprite: Sprite;
  private readonly textures = new Map<IceCarVariant, Texture>();
  private currentVariant: IceCarVariant = 'center';
  private destroyed = false;

  constructor() {
    this.shadow = new Graphics().ellipse(0, 0, 1, 1).fill({ color: 0x06131f, alpha: 0.12 });
    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.anchor.set(0.5, 0.5);
    this.container.addChild(this.shadow);
    this.container.addChild(this.sprite);

    for (const [variant, url] of Object.entries(TEXTURE_URLS) as [IceCarVariant, string][]) {
      Assets.load<Texture>(url)
        .then((tex) => {
          if (this.destroyed) return;
          this.textures.set(variant, tex);
          if (variant === this.currentVariant) this.sprite.texture = tex;
        })
        .catch(() => undefined);
    }
  }

  update(scale: Scale, x: number, y: number, rotation: number, variant: IceCarVariant): void {
    if (this.destroyed) return;
    if (variant !== this.currentVariant) {
      this.currentVariant = variant;
      const texture = this.textures.get(variant);
      if (texture) this.sprite.texture = texture;
    }
    const s = scale.factor;
    const pose = perspectiveIceCarPose({ x, y, rot: rotation });
    const size = pose.size * s;
    const px = pose.x * s;
    const py = pose.y * s;

    this.shadow.position.set(px, py + CAR_H * size * 0.25);
    this.shadow.scale.set(CAR_W * size * 0.56, CAR_H * size * 0.12);
    this.shadow.alpha = 0.13 + pose.depth * 0.1;

    this.sprite.width = CAR_W * size;
    this.sprite.height = CAR_H * size;
    this.sprite.position.set(px, py);
    this.sprite.rotation = pose.rot;
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
