import { describe, expect, it } from 'vitest';
import { RINK } from '@hockey/game-core';
import {
  CARETAKER_BOTTOM_Y,
  CARETAKER_LEFT_X,
  CARETAKER_RIGHT_X,
  CARETAKER_TOP_Y,
  CAR_H,
  CAR_W,
  FLOOD_SPRITE_HEIGHT,
  FLOOD_SPRITE_WIDTH,
  SCRAPE_SPRITE_HEIGHT,
  SCRAPE_PASS_MS,
  caretakerTopYAt,
  iceCarPosAt,
  iceCarSurfaceEffectsAt,
  perspectiveIceCarPose,
} from './IceCar.js';

describe('iceCarPosAt', () => {
  it('uses the shovel caretaker during an intermission', () => {
    const pose = iceCarPosAt(1_000, 'scrape');

    expect(pose.variant).toBe('scrape-up');
  });

  it('keeps the hose caretaker present after the game', () => {
    const start = iceCarPosAt(0, 'flood');
    const later = iceCarPosAt(12_000, 'flood');

    expect(start.variant).toBe('flood');
    expect(later.variant).toBe('flood');
    expect(Math.abs(later.x - start.x)).toBeLessThan(16);
    expect(Math.abs(later.y - start.y)).toBeLessThan(16);
    expect(start.y).toBeLessThan(RINK.height * 0.65);
    expect(FLOOD_SPRITE_HEIGHT).toBeLessThanOrEqual(SCRAPE_SPRITE_HEIGHT);
    const rendered = perspectiveIceCarPose(start);
    const renderedLeftEdge = rendered.x - (FLOOD_SPRITE_WIDTH * rendered.size) / 2;
    expect(renderedLeftEdge).toBeGreaterThanOrEqual(-18);
    expect(renderedLeftEdge).toBeLessThanOrEqual(-10);
    expect(later.y).toBeGreaterThan(0);
    expect(later.y).toBeLessThan(RINK.height);
  });

  it('moves the hose caretaker offscreen every 20 seconds and cycles four anchors', () => {
    const leftLow = iceCarPosAt(0, 'flood');
    const leavingLeft = iceCarPosAt(17_000, 'flood');
    const leftHigh = iceCarPosAt(21_000, 'flood');
    const rightLow = iceCarPosAt(41_000, 'flood');
    const rightHigh = iceCarPosAt(61_000, 'flood');
    const looped = iceCarPosAt(80_000, 'flood');

    expect(leavingLeft.x).toBeLessThan(0);
    expect(leftHigh.y).toBeLessThan(leftLow.y);
    expect(leftHigh.y).toBeLessThanOrEqual(RINK.height * 0.3);
    expect(leftLow.mirrorX).toBe(false);
    expect(leftHigh.mirrorX).toBe(false);
    expect(rightLow.x).toBeGreaterThan(RINK.width / 2);
    expect(rightLow.mirrorX).toBe(true);
    expect(rightHigh.y).toBeLessThan(rightLow.y);
    expect(rightHigh.mirrorX).toBe(true);
    expect(looped.x).toBeCloseTo(leftLow.x, 0);
    expect(looped.mirrorX).toBe(false);
  });

  it('keeps the vehicle subordinate to the rink composition', () => {
    expect(CAR_W).toBeLessThanOrEqual(110);
    expect(CAR_H).toBeLessThanOrEqual(170);
  });

  it('keeps the lanes away from rounded side boards and lets downward passes leave below the rink', () => {
    const poses = Array.from({ length: 1600 }, (_, index) => iceCarPosAt(index * 50));

    for (const pose of poses) {
      expect(pose.x).toBeGreaterThanOrEqual(CARETAKER_LEFT_X);
      expect(pose.x).toBeLessThanOrEqual(CARETAKER_RIGHT_X);
      expect(pose.y).toBeGreaterThanOrEqual(CARETAKER_TOP_Y);
      expect(pose.y).toBeLessThanOrEqual(CARETAKER_BOTTOM_Y);
    }
    expect(poses.some((pose) => pose.y > RINK.height)).toBe(true);

    const left = perspectiveIceCarPose({ x: CARETAKER_LEFT_X, y: RINK.height, rot: 0 });
    const right = perspectiveIceCarPose({ x: CARETAKER_RIGHT_X, y: RINK.height, rot: 0 });
    const widestHalfExtent = 62 * left.size;
    expect(left.x - widestHalfExtent).toBeGreaterThanOrEqual(24);
    expect(right.x + widestHalfExtent).toBeLessThanOrEqual(RINK.width - 24);
  });

  it('moves at a constant speed during a resurfacing pass', () => {
    expect(SCRAPE_PASS_MS).toBe(21_000);
    const first = iceCarPosAt(1_000);
    const second = iceCarPosAt(2_000);
    const third = iceCarPosAt(3_000);

    expect(second.y - first.y).toBeCloseTo(third.y - second.y);
  });

  it('reaches the top board, then instantly switches down one lane to the right', () => {
    const beforeSwitch = iceCarPosAt(SCRAPE_PASS_MS - 1);
    const afterSwitch = iceCarPosAt(SCRAPE_PASS_MS + 1);

    expect(beforeSwitch.variant).toBe('scrape-up');
    expect(beforeSwitch.y).toBeCloseTo(caretakerTopYAt(beforeSwitch.x), 0);
    expect(afterSwitch.variant).toBe('scrape-down');
    expect(afterSwitch.y).toBeCloseTo(caretakerTopYAt(afterSwitch.x), 0);
    expect(afterSwitch.x).toBeGreaterThan(beforeSwitch.x);
  });

  it('follows the rounded top boards on the outer lanes', () => {
    expect(caretakerTopYAt(RINK.width / 2)).toBeGreaterThanOrEqual(-60);
    expect(caretakerTopYAt(RINK.width / 2)).toBeLessThan(0);
    expect(caretakerTopYAt(CARETAKER_LEFT_X)).toBeGreaterThan(
      caretakerTopYAt(RINK.width / 2),
    );
    expect(caretakerTopYAt(CARETAKER_RIGHT_X)).toBeCloseTo(
      caretakerTopYAt(CARETAKER_LEFT_X),
    );
  });

  it('uses upright directional sprites throughout the serpentine route', () => {
    const visiblePoses = Array.from({ length: 240 }, (_, index) => iceCarPosAt(index * 250)).filter(
      (pose) => pose.y >= 0 && pose.y <= RINK.height,
    );

    expect(visiblePoses.length).toBeGreaterThan(0);
    for (const pose of visiblePoses) {
      expect(['scrape-up', 'scrape-down']).toContain(pose.variant);
      expect(pose.rot).toBeCloseTo(0);
    }
  });

  it('moves the next upward pass to another lane only after leaving below the rink', () => {
    const beforeExit = iceCarPosAt(SCRAPE_PASS_MS * 2 - 1);
    const afterExit = iceCarPosAt(SCRAPE_PASS_MS * 2 + 1);

    expect(beforeExit.variant).toBe('scrape-down');
    expect(beforeExit.y).toBeGreaterThan(RINK.height);
    expect(afterExit.variant).toBe('scrape-up');
    expect(afterExit.y).toBeGreaterThan(RINK.height);
    expect(afterExit.x).toBeGreaterThan(beforeExit.x);
  });
});

describe('iceCarSurfaceEffectsAt', () => {
  it('places a subtle wet patch where the hose spray lands', () => {
    const effects = iceCarSurfaceEffectsAt({
      x: 100,
      y: 200,
      heading: 0,
      size: 1,
      depth: 0.5,
    });

    expect(effects.water.x).toBeGreaterThan(160);
    expect(effects.water.y).toBeGreaterThan(200);
    expect(effects.water.width).toBeGreaterThan(effects.water.height);
    expect(effects.water.width).toBeGreaterThanOrEqual(110);
    expect(effects.water.alpha).toBeGreaterThan(0);
    expect(effects.water.alpha).toBeLessThan(0.3);

    const mirrored = iceCarSurfaceEffectsAt({
      x: 100,
      y: 200,
      heading: Math.PI,
      size: 1,
      depth: 0.5,
    });
    expect(mirrored.water.x).toBeLessThan(100);
  });

  it.each([
    { heading: Math.PI / 2, relation: 'above' },
    { heading: -Math.PI / 2, relation: 'below' },
    { heading: 0, relation: 'left' },
    { heading: Math.PI, relation: 'right' },
  ] as const)('keeps the resurfaced strip behind a car moving $relation', ({ heading, relation }) => {
    const effects = iceCarSurfaceEffectsAt({
      x: 100,
      y: 200,
      heading,
      size: 1,
      depth: 0.5,
    });

    if (relation === 'above') expect(effects.trail.y).toBeLessThan(200);
    if (relation === 'below') expect(effects.trail.y).toBeGreaterThan(200);
    if (relation === 'left') expect(effects.trail.x).toBeLessThan(100);
    if (relation === 'right') expect(effects.trail.x).toBeGreaterThan(100);
  });

  it('places a light snow ridge in front of the shovel', () => {
    const effects = iceCarSurfaceEffectsAt({
      x: 100,
      y: 200,
      heading: -Math.PI / 2,
      size: 1,
      depth: 0.5,
    });

    expect(effects.snow.y).toBeLessThan(200);
    expect(200 - effects.snow.y).toBeGreaterThan(55);
    expect(200 - effects.snow.y).toBeLessThan(65);
    expect(effects.snow.alpha).toBeGreaterThan(effects.trail.alpha);
    expect(effects.snow.alpha).toBeGreaterThan(0.4);
    expect(effects.snow.height).toBeLessThanOrEqual(11);
    expect(effects.trail.alpha).toBe(0);
    expect(effects.snowFlecks.width).toBeGreaterThan(effects.snow.width);
    expect(effects.snowFlecks.alpha).toBeLessThan(effects.snow.alpha);
    expect(effects.snowFlecks.alpha).toBeLessThan(0.2);
  });

  it('scales both surface effects with the perspective size', () => {
    const near = iceCarSurfaceEffectsAt({
      x: 100,
      y: 200,
      heading: Math.PI / 2,
      size: 1.2,
      depth: 1,
    });
    const far = iceCarSurfaceEffectsAt({
      x: 100,
      y: 200,
      heading: Math.PI / 2,
      size: 0.8,
      depth: 0,
    });

    expect(near.trail.width).toBeGreaterThan(far.trail.width);
    expect(near.trail.height).toBeGreaterThan(far.trail.height);
    expect(near.shadow.width).toBeGreaterThan(far.shadow.width);
    expect(near.shadow.height).toBeGreaterThan(far.shadow.height);
  });
});
