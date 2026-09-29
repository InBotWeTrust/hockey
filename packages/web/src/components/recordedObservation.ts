import {
  PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE,
  PERSPECTIVE_COURT_GOAL_VISUAL_OFFSET_X_SCALE,
  PERSPECTIVE_COURT_VISUAL_X_CENTER,
  getGoalie, simulateGoal, simulateGoalie, simulateShooter,
  type AdvancedTrainingEpisodeSample, type ObservationScene,
} from '@hockey/game-core';
import { RECORDED_RUNS, type RecordedRun } from '../screens/marksmanshipReplayData.js';
import { getReplayFrame, type ReplayFrame } from '../screens/marksmanshipReplayTimeline.js';

function positionAt(run: RecordedRun, frame: ReplayFrame) {
  const shot = frame.shot ?? run.shots.find((candidate) => candidate.wallMs > frame.wallMs) ??
    frame.anchor ?? run.shots[0]!;
  const goalie = getGoalie(run.goalieId);
  const playerX = simulateShooter(frame.shooterMs + run.phaseOffsets.shooter,
    shot.input.shooterFrequency).x;
  const goalOffsetX = simulateGoal({ ...goalie,
    goalFrequency: shot.input.goalFrequency ?? goalie.goalFrequency },
  frame.sceneMs, run.phaseOffsets.goal).offsetX *
    PERSPECTIVE_COURT_GOAL_VISUAL_OFFSET_X_SCALE;
  const goalieState = simulateGoalie({ ...goalie,
    frequency: shot.input.goalieFrequency ?? goalie.frequency },
  shot.seed, shot.index, frame.sceneMs, run.phaseOffsets.goalie);
  const goalieX = PERSPECTIVE_COURT_VISUAL_X_CENTER +
    (goalieState.position.x - PERSPECTIVE_COURT_VISUAL_X_CENTER) *
      PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE;
  return { playerX, goalOffsetX, goalieX };
}

export function sampleRecordedObservation(scene: ObservationScene, wallMs: number): {
  frame: ReplayFrame;
  motion: AdvancedTrainingEpisodeSample;
} | null {
  if (scene.source !== 'recorded' || !scene.recordingKey) return null;
  const run = RECORDED_RUNS.find((candidate) => candidate.key === scene.recordingKey);
  if (!run) return null;
  const frame = getReplayFrame(run, wallMs);
  const current = positionAt(run, frame);
  const future = positionAt(run, getReplayFrame(run, wallMs + 25));
  return { frame, motion: {
    ...current,
    playerDirection: future.playerX >= current.playerX ? 1 : -1,
    goalieDirection: future.goalieX >= current.goalieX ? 1 : -1,
    goalDirection: future.goalOffsetX >= current.goalOffsetX ? 1 : -1,
  } };
}
