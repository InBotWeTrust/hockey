import { Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { RINK } from '@hockey/game-core';
import type { Scale } from '../coords.js';
import {
  TRAINING_NEW_COURT_VISUAL_Y_OFFSET,
  TRAINING_NEW_COURT_VISUAL_Y_SCALE,
} from '../trainingNewCourt.js';

// Render size in rink coordinates before perspective depth scaling.
export const CAR_W = 108;
export const CAR_H = 164;
export const SCRAPE_SPRITE_WIDTH = 88;
export const SCRAPE_SPRITE_HEIGHT = 132;
export const FLOOD_SPRITE_WIDTH = 96;
export const FLOOD_SPRITE_HEIGHT = 132;

export const CARETAKER_LEFT_X = 102;
export const CARETAKER_RIGHT_X = RINK.width - 102;
export const CARETAKER_TOP_Y = -55;
export const CARETAKER_BOTTOM_Y = RINK.height + CAR_H / 2;

const N_STRIPS = 6;
const STRIP_W = (CARETAKER_RIGHT_X - CARETAKER_LEFT_X) / (N_STRIPS - 1);
const TOP_BOARD_RADIUS = 120;
const SCRAPE_SPRITE_HALF_WIDTH = 44;

export const SCRAPE_PASS_MS = 21_000;

interface Seg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  ms: number;
  facing: 'up' | 'down';
}

export type IceMaintenanceMode = 'scrape' | 'flood';
type IceCarVariant = 'scrape-up' | 'scrape-down' | 'flood';

type IceCarPose = {
  x: number;
  y: number;
  rot: number;
  heading: number;
  variant: IceCarVariant;
  mirrorX: boolean;
};

type IceCarSurfaceEffect = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  alpha: number;
};

const TEXTURE_URLS: Record<IceCarVariant, string> = {
  'scrape-up': '/sprites/rink-caretaker-scrape.webp',
  'scrape-down': '/sprites/rink-caretaker-scrape-down.webp',
  flood: '/sprites/rink-caretaker-flood.webp',
};

const FLOOD_SLOT_MS = 20_000;
const FLOOD_HOLD_MS = 16_000;
const FLOOD_TRAVEL_MS = 2_000;
const FLOOD_LEFT_X = 42.5;
const FLOOD_RIGHT_X = RINK.width - FLOOD_LEFT_X;
const FLOOD_LOW_Y = RINK.height * 0.61;
const FLOOD_HIGH_Y = RINK.height * 0.28;

type FloodAnchor = { x: number; y: number; mirrorX: boolean };
const FLOOD_ANCHORS: readonly FloodAnchor[] = [
  { x: FLOOD_LEFT_X, y: FLOOD_LOW_Y, mirrorX: false },
  { x: FLOOD_LEFT_X, y: FLOOD_HIGH_Y, mirrorX: false },
  { x: FLOOD_RIGHT_X, y: FLOOD_LOW_Y, mirrorX: true },
  { x: FLOOD_RIGHT_X, y: FLOOD_HIGH_Y, mirrorX: true },
];

function smoothstep(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function floodOffscreenX(anchor: FloodAnchor): number {
  return anchor.mirrorX
    ? RINK.width + FLOOD_SPRITE_WIDTH / 2 + 20
    : -FLOOD_SPRITE_WIDTH / 2 - 20;
}

function topBoardYAt(x: number): number {
  if (x < TOP_BOARD_RADIUS) {
    return TOP_BOARD_RADIUS - Math.sqrt(TOP_BOARD_RADIUS ** 2 - (x - TOP_BOARD_RADIUS) ** 2);
  }
  if (x > RINK.width - TOP_BOARD_RADIUS) {
    const centerX = RINK.width - TOP_BOARD_RADIUS;
    return TOP_BOARD_RADIUS - Math.sqrt(TOP_BOARD_RADIUS ** 2 - (x - centerX) ** 2);
  }
  return 0;
}

export function caretakerTopYAt(x: number): number {
  const spriteOuterEdge = x < RINK.width / 2
    ? x - SCRAPE_SPRITE_HALF_WIDTH
    : x + SCRAPE_SPRITE_HALF_WIDTH;
  return CARETAKER_TOP_Y + topBoardYAt(spriteOuterEdge);
}

function buildLoop(): Seg[] {
  const segs: Seg[] = [];
  const laneXs = Array.from(
    { length: N_STRIPS },
    (_, index) => CARETAKER_LEFT_X + index * STRIP_W,
  );
  const laneOrder = [0, 1, 2, 3, 4, 5];

  for (let index = 0; index < laneOrder.length; index++) {
    const laneIndex = laneOrder[index] ?? 0;
    const x = laneXs[laneIndex] ?? CARETAKER_LEFT_X;
    const movingUp = index % 2 === 0;
    const laneTopY = caretakerTopYAt(x);
    const startY = movingUp ? CARETAKER_BOTTOM_Y : laneTopY;
    const endY = movingUp ? laneTopY : CARETAKER_BOTTOM_Y;
    segs.push({
      x0: x,
      y0: startY,
      x1: x,
      y1: endY,
      ms: SCRAPE_PASS_MS,
      facing: movingUp ? 'up' : 'down',
    });
  }

  return segs;
}

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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function depthAt(y: number): number {
  return clamp01(
    (y - CARETAKER_TOP_Y) / (CARETAKER_BOTTOM_Y - CARETAKER_TOP_Y),
  );
}

function perspectiveScaleAt(y: number): number {
  const depth = depthAt(y);
  return PERSPECTIVE_TOP_SCALE + (PERSPECTIVE_BOTTOM_SCALE - PERSPECTIVE_TOP_SCALE) * depth;
}

function posInSeg(seg: Seg, f: number): IceCarPose {
  const x = seg.x0 + (seg.x1 - seg.x0) * f;
  const y = seg.y0 + (seg.y1 - seg.y0) * f;
  return {
    x,
    y,
    rot: 0,
    heading: Math.atan2(seg.y1 - seg.y0, seg.x1 - seg.x0),
    variant: seg.facing === 'up' ? 'scrape-up' : 'scrape-down',
    mirrorX: false,
  };
}

export function iceCarPosAt(
  elapsed: number,
  mode: IceMaintenanceMode = 'scrape',
): IceCarPose {
  if (mode === 'flood') {
    const normalizedElapsed = Math.max(0, elapsed);
    const slotIndex = Math.floor(normalizedElapsed / FLOOD_SLOT_MS) % FLOOD_ANCHORS.length;
    const slotElapsed = normalizedElapsed % FLOOD_SLOT_MS;
    const anchor = FLOOD_ANCHORS[slotIndex] ?? FLOOD_ANCHORS[0]!;
    const nextAnchor = FLOOD_ANCHORS[(slotIndex + 1) % FLOOD_ANCHORS.length] ?? FLOOD_ANCHORS[0]!;
    let activeAnchor = anchor;
    let x = anchor.x;
    let y = anchor.y;

    if (slotElapsed < FLOOD_HOLD_MS) {
      const idlePhase = slotElapsed / 1_800;
      x += Math.sin(idlePhase) * 2;
      y += Math.cos(idlePhase * 0.7) * 2;
    } else if (slotElapsed < FLOOD_HOLD_MS + FLOOD_TRAVEL_MS) {
      const progress = smoothstep((slotElapsed - FLOOD_HOLD_MS) / FLOOD_TRAVEL_MS);
      x = anchor.x + (floodOffscreenX(anchor) - anchor.x) * progress;
    } else {
      activeAnchor = nextAnchor;
      const progress = smoothstep(
        (slotElapsed - FLOOD_HOLD_MS - FLOOD_TRAVEL_MS) / FLOOD_TRAVEL_MS,
      );
      x = floodOffscreenX(nextAnchor) + (nextAnchor.x - floodOffscreenX(nextAnchor)) * progress;
      y = nextAnchor.y;
    }

    return {
      x,
      y,
      rot: 0,
      heading: activeAnchor.mirrorX ? Math.PI : 0,
      variant: 'flood',
      mirrorX: activeAnchor.mirrorX,
    };
  }
  const t = ((elapsed % LOOP_MS) + LOOP_MS) % LOOP_MS;
  for (let i = 0; i < LOOP.length; i++) {
    const seg = LOOP[i];
    const segStart = LOOP_CUM_STARTS[i] ?? 0;
    if (seg === undefined) break;
    if (t < segStart + seg.ms) {
      return posInSeg(seg, (t - segStart) / seg.ms);
    }
  }
  return {
    x: CARETAKER_LEFT_X,
    y: CARETAKER_BOTTOM_Y,
    rot: 0,
    heading: -Math.PI / 2,
    variant: 'scrape-up',
    mirrorX: false,
  };
}

export function iceCarSurfaceEffectsAt(input: {
  x: number;
  y: number;
  heading: number;
  size: number;
  depth: number;
}): {
  trail: IceCarSurfaceEffect;
  shadow: IceCarSurfaceEffect;
  snow: IceCarSurfaceEffect;
  snowFlecks: IceCarSurfaceEffect;
  water: IceCarSurfaceEffect;
} {
  const trailLength = CAR_H * input.size * 0.82;
  const trailOffset = CAR_H * input.size * 0.58;
  const behindX = -Math.cos(input.heading);
  const behindY = -Math.sin(input.heading);
  const aheadX = Math.cos(input.heading);
  const aheadY = Math.sin(input.heading);

  return {
    trail: {
      x: input.x + behindX * trailOffset,
      y: input.y + behindY * trailOffset,
      width: CAR_W * input.size * 0.72,
      height: trailLength,
      rotation: input.heading - Math.PI / 2,
      alpha: 0,
    },
    shadow: {
      x: input.x,
      y: input.y + CAR_H * input.size * 0.05,
      width: CAR_W * input.size * 0.76,
      height: CAR_H * input.size * 0.64,
      rotation: input.heading - Math.PI / 2,
      alpha: 0.1 + input.depth * 0.07,
    },
    snow: {
      x: input.x + aheadX * CAR_H * input.size * 0.36,
      y: input.y + aheadY * CAR_H * input.size * 0.36,
      width: CAR_W * input.size * 0.78,
      height: 10 * input.size,
      rotation: input.heading - Math.PI / 2,
      alpha: 0.58 + input.depth * 0.08,
    },
    snowFlecks: {
      x: input.x + aheadX * CAR_H * input.size * 0.36,
      y: input.y + aheadY * CAR_H * input.size * 0.36,
      width: CAR_W * input.size * 1.02,
      height: 24 * input.size,
      rotation: input.heading - Math.PI / 2,
      alpha: 0.14 + input.depth * 0.04,
    },
    water: {
      x: input.x + Math.cos(input.heading) * CAR_W * input.size * 0.65,
      y: input.y + CAR_H * input.size * 0.25,
      width: 118 * input.size,
      height: 28 * input.size,
      rotation: -0.12 * Math.cos(input.heading),
      alpha: 0.12 + input.depth * 0.04,
    },
  };
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
  private readonly trail: Graphics;
  private readonly shadow: Graphics;
  private readonly snow: Graphics;
  private readonly snowFlecks: Graphics;
  private readonly water: Graphics;
  private readonly waterSplashes: Graphics;
  private readonly sprite: Sprite;
  private readonly textures = new Map<IceCarVariant, Texture>();
  private currentVariant: IceCarVariant = 'scrape-up';
  private snowPhase = 0;
  private destroyed = false;

  constructor() {
    this.trail = new Graphics()
      .roundRect(-0.5, -0.5, 1, 1, 0.16)
      .fill({ color: 0xb9d7ea, alpha: 1 });
    this.shadow = new Graphics().ellipse(0, 0, 1, 1).fill({ color: 0x06131f, alpha: 0.12 });
    this.snow = new Graphics()
      .moveTo(-0.5, -0.5)
      .lineTo(0.5, -0.5)
      .lineTo(0.5, 0.18)
      .quadraticCurveTo(0.5, 0.5, 0.18, 0.5)
      .lineTo(-0.18, 0.5)
      .quadraticCurveTo(-0.5, 0.5, -0.5, 0.18)
      .closePath()
      .fill({ color: 0xffffff, alpha: 1 })
      .circle(-0.28, -0.32, 0.14)
      .circle(0.05, -0.4, 0.11)
      .circle(0.32, -0.26, 0.09)
      .fill({ color: 0xf7fbfd, alpha: 0.9 });
    this.snowFlecks = new Graphics()
      .circle(-46, 0, 2.8)
      .circle(-54, -5, 2.2)
      .circle(-62, -10, 1.7)
      .circle(46, 0, 2.8)
      .circle(54, -5, 2.2)
      .circle(62, -10, 1.7)
      .fill({ color: 0xffffff, alpha: 1 });
    this.water = new Graphics()
      .ellipse(0, 0, 0.5, 0.5)
      .fill({ color: 0x9bd7ee, alpha: 1 })
      .ellipse(0, 0, 0.42, 0.34)
      .stroke({ color: 0xe8f8ff, width: 0.025, alpha: 0.8 });
    this.waterSplashes = new Graphics()
      .circle(-18, -4, 2.2)
      .circle(-5, -10, 1.7)
      .circle(10, -7, 2)
      .circle(22, -2, 1.5)
      .fill({ color: 0xe8f8ff, alpha: 1 });
    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.anchor.set(0.5, 0.5);
    this.container.addChild(this.water);
    this.container.addChild(this.trail);
    this.container.addChild(this.shadow);
    this.container.addChild(this.sprite);
    this.container.addChild(this.snow);
    this.container.addChild(this.snowFlecks);
    this.container.addChild(this.waterSplashes);

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

  update(
    scale: Scale,
    x: number,
    y: number,
    rotation: number,
    variant: IceCarVariant,
    heading = rotation - Math.PI / 2,
    mirrorX = false,
  ): void {
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
    const effects = iceCarSurfaceEffectsAt({
      x: px,
      y: py,
      heading,
      size,
      depth: pose.depth,
    });

    this.trail.position.set(effects.trail.x, effects.trail.y);
    this.trail.scale.set(effects.trail.width, effects.trail.height);
    this.trail.rotation = effects.trail.rotation;
    this.trail.alpha = variant === 'flood' ? 0 : effects.trail.alpha;

    this.shadow.position.set(effects.shadow.x, effects.shadow.y);
    this.shadow.scale.set(effects.shadow.width, effects.shadow.height);
    this.shadow.rotation = effects.shadow.rotation;
    this.shadow.alpha = effects.shadow.alpha;

    this.snowPhase += 0.16;
    this.snow.position.set(effects.snow.x, effects.snow.y);
    this.snow.scale.set(effects.snow.width, effects.snow.height);
    this.snow.rotation = effects.snow.rotation;
    this.snow.alpha = variant === 'flood' ? 0 : effects.snow.alpha;

    this.snowFlecks.position.set(effects.snowFlecks.x, effects.snowFlecks.y);
    const sideSpread = 1 + Math.sin(this.snowPhase) * 0.08;
    const fleckScale = effects.snowFlecks.height / 24;
    this.snowFlecks.scale.set(
      fleckScale * sideSpread,
      fleckScale,
    );
    this.snowFlecks.rotation = effects.snowFlecks.rotation;
    this.snowFlecks.alpha = variant === 'flood' ? 0 : effects.snowFlecks.alpha;

    const waterSpread = 1 + Math.sin(this.snowPhase * 0.72) * 0.05;
    this.water.position.set(effects.water.x, effects.water.y);
    this.water.scale.set(effects.water.width * waterSpread, effects.water.height);
    this.water.rotation = effects.water.rotation;
    this.water.alpha = variant === 'flood' ? effects.water.alpha : 0;

    const splashScale = (effects.water.height / 22) *
      (1 + Math.sin(this.snowPhase * 1.25) * 0.08);
    this.waterSplashes.position.set(effects.water.x, effects.water.y);
    this.waterSplashes.scale.set(splashScale, splashScale);
    this.waterSplashes.rotation = effects.water.rotation;
    this.waterSplashes.alpha = variant === 'flood' ? 0.34 : 0;

    const spriteWidth = variant === 'flood' ? FLOOD_SPRITE_WIDTH : SCRAPE_SPRITE_WIDTH;
    const spriteHeight = variant === 'flood' ? FLOOD_SPRITE_HEIGHT : SCRAPE_SPRITE_HEIGHT;
    this.sprite.width = spriteWidth * size;
    this.sprite.height = spriteHeight * size;
    this.sprite.scale.x = (mirrorX ? -1 : 1) * Math.abs(this.sprite.scale.x);
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
