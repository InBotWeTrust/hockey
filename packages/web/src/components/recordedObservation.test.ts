import { describe, expect, it } from 'vitest';
import { GOALIE_SIZE, GOAL_OPENING, getObservationScene,
  type ObservationScene } from '@hockey/game-core';
import { getReplayFrame } from '../screens/marksmanshipReplayTimeline.js';
import { RECORDED_RUNS } from '../screens/marksmanshipReplayData.js';
import { sampleRecordedObservation } from './recordedObservation.js';

function visiblyOpen(scene: ObservationScene, wallMs: number): boolean {
  const sample = sampleRecordedObservation(scene, wallMs)!;
  const { playerX, goalOffsetX, goalieX } = sample.motion;
  return playerX > GOAL_OPENING.xMin + goalOffsetX + 8 &&
    playerX < GOAL_OPENING.xMax + goalOffsetX - 8 &&
    Math.abs(playerX - goalieX) > GOALIE_SIZE.width / 2 + 13;
}

describe('recorded observation playback', () => {
  it('uses the recording timeline, including separate shooter and scene clocks', () => {
    const scene = getObservationScene('notice_independent', 0);
    const run = RECORDED_RUNS.find((candidate) => candidate.key === scene.recordingKey)!;
    const wallMs = 143_500;
    const frame = getReplayFrame(run, wallMs);
    const sample = sampleRecordedObservation(scene, wallMs);
    expect(sample).not.toBeNull();
    expect(sample!.frame.sceneMs).toBe(frame.sceneMs);
    expect(sample!.frame.shooterMs).toBe(frame.shooterMs);
    expect(sample!.frame.shooterMs).not.toBe(frame.sceneMs);
    expect(sample!.motion.playerX).toBeGreaterThan(0);
  });

  it('labels the path visible now, not the historical shot result', () => {
    for (let variant = 0; variant < 3; variant++) {
      const scene = getObservationScene('notice_independent', variant);
      if (scene.opening) {
        expect(visiblyOpen(scene, scene.decisionMs)).toBe(true);
      } else {
        const opened: number[] = [];
        for (let wallMs = scene.startMs; wallMs <= scene.endMs; wallMs += 5) {
          if (visiblyOpen(scene, wallMs)) opened.push(wallMs);
        }
        expect(opened, scene.id).toEqual([]);
      }
    }
  });
});
