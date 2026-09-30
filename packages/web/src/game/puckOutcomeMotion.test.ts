import { GOAL_OPENING, RINK } from '@hockey/game-core';
import { describe, expect, it } from 'vitest';
import {
  puckOutcomeMotion,
  puckResultContact,
  reconcilePuckResultDisplayKind,
} from './puckOutcomeMotion.js';

describe('puckOutcomeMotion', () => {
  it('keeps a detected post hit when the server confirms the underlying miss', () => {
    expect(reconcilePuckResultDisplayKind('post', 'miss')).toBe('post');
    expect(reconcilePuckResultDisplayKind('goal', 'save')).toBe('save');
  });

  it('starts each outcome at its visual result contact', () => {
    expect(puckResultContact({ type: 'save', goalieContact: { x: 240, y: 82 } }, 190)).toEqual({
      x: 240,
      y: 96,
    });
    expect(puckResultContact({ type: 'goal', hitPoint: { x: 310, y: 60 } }, 190)).toEqual({
      x: 310,
      y: 60,
    });
    expect(puckResultContact({ type: 'miss', reason: 'wide' }, 190)).toEqual({
      x: 190,
      y: GOAL_OPENING.y,
    });
  });

  it('deflects a save down and away from the goalie centre', () => {
    expect(puckOutcomeMotion('save', { x: 250, y: 80 })).toEqual({
      end: { x: 190, y: 180 },
      durationMs: 320,
    });
    expect(puckOutcomeMotion('save', { x: 322, y: 80 })).toEqual({
      end: { x: 382, y: 180 },
      durationMs: 320,
    });
  });

  it('rebounds from either post toward the centre of the rink', () => {
    expect(puckOutcomeMotion('post', { x: GOAL_OPENING.xMin, y: GOAL_OPENING.y })).toEqual({
      end: { x: GOAL_OPENING.xMin + 78, y: GOAL_OPENING.y + 125 },
      durationMs: 280,
    });
    expect(puckOutcomeMotion('post', { x: GOAL_OPENING.xMax, y: GOAL_OPENING.y })).toEqual({
      end: { x: GOAL_OPENING.xMax - 78, y: GOAL_OPENING.y + 125 },
      durationMs: 280,
    });
  });

  it('continues an ordinary miss past the goal line to the end boards', () => {
    const motion = puckOutcomeMotion('miss', { x: 170, y: GOAL_OPENING.y });

    expect(motion).toEqual({
      end: { x: 170, y: 113 },
      durationMs: 265,
      waypoint: {
        position: { x: 170, y: 18 },
        progress: 45 / 265,
      },
    });
  });

  it('reflects misses inward from the rounded end-board corners', () => {
    const left = puckOutcomeMotion('miss', { x: 50, y: GOAL_OPENING.y });
    const right = puckOutcomeMotion('miss', { x: RINK.width - 50, y: GOAL_OPENING.y });

    expect(left?.waypoint?.position.x).toBe(50);
    expect(left?.waypoint?.position.y).toBeGreaterThan(18);
    expect(left?.end.x).toBeGreaterThan(left?.waypoint?.position.x ?? Number.POSITIVE_INFINITY);
    expect(left?.end.y).toBeGreaterThan(left?.waypoint?.position.y ?? Number.POSITIVE_INFINITY);
    expect(right?.waypoint?.position.x).toBe(RINK.width - 50);
    expect(right?.end.x).toBeLessThan(right?.waypoint?.position.x ?? Number.NEGATIVE_INFINITY);
    expect(right?.end.y).toBeCloseTo(left?.end.y ?? 0);
  });

  it('stops a rebound before it crosses the goal', () => {
    const motion = puckOutcomeMotion('miss', { x: 230, y: GOAL_OPENING.y }, false, 1, [
      { minX: 220, maxX: 240, minY: 50, maxY: 70 },
    ]);

    expect(motion?.end).toEqual({ x: 230, y: 50 });
    expect(motion?.durationMs).toBeLessThan(265);
  });

  it('keeps the board reflection angle when the goal shortens the rebound', () => {
    const motion = puckOutcomeMotion('miss', { x: 250, y: GOAL_OPENING.y }, false, 1, [
      { minX: 234, maxX: 338, minY: 30, maxY: 60 },
    ]);

    expect(motion?.waypoint?.position).toEqual({ x: 250, y: 18 });
    expect(motion?.end).toEqual({ x: 250, y: 30 });
    expect(motion?.durationMs).toBeGreaterThan(45);
  });

  it('stops a rebound before it crosses the goalie', () => {
    const motion = puckOutcomeMotion('miss', { x: 170, y: GOAL_OPENING.y }, false, 1, [
      { minX: 150, maxX: 190, minY: 70, maxY: 100 },
    ]);

    expect(motion?.end).toEqual({ x: 170, y: 70 });
    expect(motion?.durationMs).toBeLessThan(265);
  });

  it('does not add a second motion for a goal', () => {
    expect(puckOutcomeMotion('goal', { x: 286, y: GOAL_OPENING.y })).toBeNull();
  });

  it('collapses outcome motion to its endpoint when reduced motion is requested', () => {
    expect(puckOutcomeMotion('save', { x: 250, y: 80 }, true)).toEqual({
      end: { x: 190, y: 180 },
      durationMs: 0,
    });
  });
});
