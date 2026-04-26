import { Assets, Container, Sprite, Texture } from 'pixi.js';
import { RINK } from '@hockey/game-core';
import type { Scale } from '../coords.js';

// Sprite: 550×1024 top-down view. Rotation 0 = car faces north (toward goal).
export const CAR_W = 68;
export const CAR_H = Math.round(CAR_W * (1024 / 550)); // ≈ 127

const BOARD_MARGIN = 20;
// When driving N/S the car occupies CAR_W horizontally; clamp X so it stays inside glass.
const X_LEFT  = BOARD_MARGIN + Math.round(CAR_W / 2); // ≈ 54
const X_RIGHT = RINK.width - BOARD_MARGIN - Math.round(CAR_W / 2); // ≈ 518
// When driving N/S the car occupies CAR_H vertically.
// Goalie bottom edge is at ~92; keep car top edge (Y_TOP - CAR_H/2) below that with margin.
const Y_TOP    = 165; // top edge ≈ 101, just below goalie area (~92)
const Y_BOTTOM = RINK.height - BOARD_MARGIN - Math.round(CAR_H / 2); // ≈ 616

// 6 vertical strips spanning the rink width left→right.
const N_STRIPS = 6;
const STRIP_W  = Math.round((X_RIGHT - X_LEFT) / (N_STRIPS - 1)); // ≈ 93

const PASS_MS   = 9000; // one N-S or S-N pass
const TURN_MS   = 1140; // horizontal U-turn to next strip
const ENTRY_MS  = 3800; // enter from off-screen bottom to Y_TOP
const RETURN_MS = 4200; // drive west along top board back to X_LEFT

interface Seg { x0: number; y0: number; x1: number; y1: number; ms: number; rot: number }

function buildEntry(): Seg {
  const offscreen = RINK.height + CAR_H / 2;
  return { x0: X_LEFT, y0: offscreen, x1: X_LEFT, y1: Y_TOP, ms: ENTRY_MS, rot: 0 };
}

function buildLoop(): Seg[] {
  const segs: Seg[] = [];

  // Pass 0 starts going south from Y_TOP so it connects to the entry (car arrives at Y_TOP).
  for (let i = 0; i < N_STRIPS; i++) {
    const x = X_LEFT + i * STRIP_W;
    const goDown = i % 2 === 0; // even strips go south, odd go north
    segs.push({
      x0: x, y0: goDown ? Y_TOP    : Y_BOTTOM,
      x1: x, y1: goDown ? Y_BOTTOM : Y_TOP,
      ms: PASS_MS,
      rot: goDown ? Math.PI : 0, // south = π, north = 0
    });
    if (i < N_STRIPS - 1) {
      // Horizontal U-turn: shift east to next strip at the current board side.
      const turnY = goDown ? Y_BOTTOM : Y_TOP;
      segs.push({
        x0: x, y0: turnY,
        x1: x + STRIP_W, y1: turnY,
        ms: TURN_MS,
        rot: Math.PI / 2, // facing east
      });
    }
  }

  // Last strip (i=5, goDown=false) ends at (X_RIGHT-ish, Y_TOP).
  // Drive west back to X_LEFT along the top board to close the loop.
  const lastX = X_LEFT + (N_STRIPS - 1) * STRIP_W;
  segs.push({
    x0: lastX, y0: Y_TOP,
    x1: X_LEFT, y1: Y_TOP,
    ms: RETURN_MS,
    rot: -Math.PI / 2, // facing west
  });

  return segs;
}

const ENTRY = buildEntry();
const LOOP  = buildLoop();

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

function posInSeg(seg: Seg, f: number): { x: number; y: number; rot: number } {
  const e = seg.ms >= PASS_MS ? easeInOut(f) : f;
  return {
    x: seg.x0 + (seg.x1 - seg.x0) * e,
    y: seg.y0 + (seg.y1 - seg.y0) * e,
    rot: seg.rot,
  };
}

export function iceCarPosAt(elapsed: number): { x: number; y: number; rot: number } {
  if (elapsed < ENTRY_MS) {
    return posInSeg(ENTRY, elapsed / ENTRY_MS);
  }

  const t = ((elapsed - ENTRY_MS) % LOOP_MS + LOOP_MS) % LOOP_MS;
  for (let i = 0; i < LOOP.length; i++) {
    const seg = LOOP[i];
    const segStart = LOOP_CUM_STARTS[i] ?? 0;
    if (seg === undefined) break;
    if (t < segStart + seg.ms) {
      return posInSeg(seg, (t - segStart) / seg.ms);
    }
  }
  return { x: X_LEFT, y: Y_TOP, rot: 0 };
}

export class IceCar {
  readonly container = new Container();
  private readonly sprite: Sprite;

  constructor() {
    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.anchor.set(0.5, 0.5);
    this.container.addChild(this.sprite);
    Assets.load<Texture>('/sprites/ice_car.webp').then((tex) => {
      this.sprite.texture = tex;
    });
  }

  update(scale: Scale, x: number, y: number, rotation: number): void {
    const s = scale.factor;
    this.sprite.width  = CAR_W * s;
    this.sprite.height = CAR_H * s;
    this.sprite.position.set(x * s, y * s);
    this.sprite.rotation = rotation;
    this.container.position.set(scale.offsetX, scale.offsetY);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
