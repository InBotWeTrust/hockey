import { GOAL_OPENING, PUCK_SPEED_PER_MS, PUCK_START } from '@hockey/game-core';
import { SHOT_RESULT_PAUSE_MS } from '../game/shotTiming.js';
import type { RecordedRun, RecordedShot } from './marksmanshipReplayData.js';

export const REPLAY_DURATION_MS = 180_000;
export const REPLAY_RESULT_VISIBLE_MS = 600;

export interface ReplayFrame {
  wallMs: number;
  sceneMs: number;
  shooterMs: number;
  phase: 'idle' | 'flight' | 'result';
  shot: RecordedShot | null;
  anchor: RecordedShot | null;
  flightProgress: number;
  resultElapsedMs: number;
}

export function seekReplayTime(wallMs: number, deltaMs: number): number {
  const value = Number.isFinite(wallMs + deltaMs) ? wallMs + deltaMs : 0;
  return Math.max(0, Math.min(REPLAY_DURATION_MS, value));
}

export function formatReplayTime(timeMs: number): string {
  const value = seekReplayTime(timeMs, 0);
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.floor((value % 60_000) / 1_000);
  const centiseconds = Math.floor((value % 1_000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

export function getReplayFrame(run: RecordedRun, requestedWallMs: number): ReplayFrame {
  const wallMs = seekReplayTime(requestedWallMs, 0);
  const shots = run.shots;
  let low = 0;
  let high = shots.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (shots[mid]!.wallMs <= wallMs) low = mid + 1;
    else high = mid;
  }
  const previous = shots[low - 1] ?? null;
  const next = shots[low] ?? null;
  if (previous === null) {
    const ratio = next && next.wallMs > 0 ? wallMs / next.wallMs : 0;
    return { wallMs, sceneMs: (next?.sceneMs ?? 0) * ratio,
      shooterMs: (next?.shooterMs ?? 0) * ratio, phase: 'idle', shot: null,
      anchor: null, flightProgress: 0, resultElapsedMs: 0 };
  }

  const elapsed = wallMs - previous.wallMs;
  const flightMs = (PUCK_START.y - GOAL_OPENING.y) /
    (previous.input.puckSpeedPerMs ?? PUCK_SPEED_PER_MS);
  const sceneAtImpact = previous.sceneMs + flightMs;
  if (elapsed < flightMs) {
    return { wallMs, sceneMs: previous.sceneMs + elapsed, shooterMs: previous.shooterMs,
      phase: 'flight', shot: previous, anchor: previous,
      flightProgress: Math.max(0, elapsed / flightMs), resultElapsedMs: 0 };
  }
  if (elapsed < flightMs + SHOT_RESULT_PAUSE_MS) {
    return { wallMs, sceneMs: sceneAtImpact, shooterMs: previous.shooterMs,
      phase: 'result', shot: previous, anchor: previous,
      flightProgress: 1, resultElapsedMs: elapsed - flightMs };
  }

  const resumedAt = previous.wallMs + flightMs + SHOT_RESULT_PAUSE_MS;
  const activeElapsed = Math.max(0, wallMs - resumedAt);
  const activeDuration = next ? Math.max(0, next.wallMs - resumedAt) : 0;
  const progress = next && activeDuration > 0 ? Math.min(1, activeElapsed / activeDuration) : null;
  return { wallMs,
    sceneMs: progress === null ? sceneAtImpact + activeElapsed :
      sceneAtImpact + (next!.sceneMs - sceneAtImpact) * progress,
    shooterMs: progress === null ? previous.shooterMs + activeElapsed :
      previous.shooterMs + (next!.shooterMs - previous.shooterMs) * progress,
    phase: 'idle', shot: null, anchor: previous,
    flightProgress: 0, resultElapsedMs: 0 };
}
