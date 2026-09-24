import {
  STICK_NEUTRAL,
  getGoalie,
  getSessionPhaseOffsets,
  resolvePerspectiveCourtShot,
  type SessionPhaseOffsets,
  type ShotInput,
} from '@hockey/game-core';
import fixture from './marksmanshipReplayFixture.json';

export type RecordedResult = 'goal' | 'save' | 'miss';

export interface RecordedShot {
  index: number;
  wallMs: number;
  sceneMs: number;
  shooterMs: number;
  input: ShotInput;
  seed: string;
  result: RecordedResult;
}

export interface RecordedRun {
  key: string;
  label: string;
  goalieId: string;
  stickZoneMultiplier: number;
  phaseOffsets: SessionPhaseOffsets;
  shots: RecordedShot[];
}

export const RECORDED_RUNS: readonly RecordedRun[] = fixture.map((raw) => ({
  key: raw.key,
  label: raw.label,
  goalieId: raw.goalieId,
  stickZoneMultiplier: raw.stickZoneMultiplier,
  phaseOffsets: getSessionPhaseOffsets(raw.matchSeed),
  shots: raw.shots.map((shot) => ({
    index: shot.index,
    wallMs: shot.wallMs,
    sceneMs: shot.input.tapTime,
    shooterMs: shot.input.shooterTapTime ?? shot.input.tapTime,
    input: shot.input,
    seed: shot.seed,
    result: shot.result as RecordedResult,
  })),
}));

export function verifyRecordedRun(run: RecordedRun): string[] {
  const errors: string[] = [];
  let previousWallMs = -1;
  for (const [position, shot] of run.shots.entries()) {
    if (shot.index !== position + 1) errors.push(`shot ${position + 1}: index ${shot.index}`);
    if (!Number.isFinite(shot.wallMs) || shot.wallMs < previousWallMs || shot.wallMs > 180_000) {
      errors.push(`shot ${shot.index}: invalid wall time`);
    }
    if (!Number.isFinite(shot.sceneMs) || !Number.isFinite(shot.shooterMs) ||
        shot.sceneMs < 0 || shot.shooterMs < 0) errors.push(`shot ${shot.index}: invalid clocks`);
    previousWallMs = shot.wallMs;
    const calculated = resolvePerspectiveCourtShot(
      shot.input,
      getGoalie(run.goalieId),
      shot.seed,
      shot.index,
      { ...STICK_NEUTRAL, shotZoneMultiplier: Math.max(1, run.stickZoneMultiplier) },
      run.phaseOffsets,
    ).type;
    if (calculated !== shot.result) {
      errors.push(`shot ${shot.index}: recorded ${shot.result}, calculated ${calculated}`);
    }
  }
  return errors;
}
