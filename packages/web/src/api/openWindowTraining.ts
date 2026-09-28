import type { CuratedOpenWindowScene, OpenWindowDecisionEvaluation,
  OpenWindowStepKey, ShotResult } from '@hockey/game-core';
import { apiFetch } from './apiFetch.js';

export interface OpenWindowRunState {
  run_id: string;
  step_key: OpenWindowStepKey;
  phase: 'practice' | 'check';
  scene: CuratedOpenWindowScene;
  demonstration: CuratedOpenWindowScene;
  attempt_token: string;
  attempt_index: number;
  decision_index: number;
  sound_count: number;
  practice_decisions: number;
  full_runs: number;
  series_decisions: number;
  shots_taken: number;
  active_elapsed_ms: number;
  skip_recorded: boolean;
  game_core_version: number;
  bank_version: number;
  attempt_started_at: string | null;
  server_now: string;
}

export interface OpenWindowDecisionResponse {
  server_result: ShotResult['type'] | null;
  evaluation: OpenWindowDecisionEvaluation;
  sound: boolean;
  completed: boolean;
  reward_granted: { stars: number; experience: number } | null;
  state: OpenWindowRunState;
}

const base = (stepKey: OpenWindowStepKey) =>
  `/duel/training/advanced/open-windows/${stepKey}`;

export function startOpenWindowStep(stepKey: OpenWindowStepKey): Promise<{
  state: OpenWindowRunState; restarted_due_to_version: boolean;
  restarted_due_to_timeout?: boolean;
}> {
  return apiFetch(`${base(stepKey)}/start`, { method: 'POST' });
}

export function startOpenWindowAttempt(stepKey: OpenWindowStepKey,
  runId: string): Promise<{ state: OpenWindowRunState }> {
  return apiFetch(`${base(stepKey)}/attempt/start`, {
    method: 'POST', body: JSON.stringify({ run_id: runId }),
  });
}

export function submitOpenWindowDecision(stepKey: OpenWindowStepKey, body: {
  run_id: string;
  attempt_token: string;
  decision_index: number;
  scene_id: string;
  input: { type: 'shot'; tap_time_ms: number } | { type: 'skip' };
}): Promise<OpenWindowDecisionResponse> {
  return apiFetch(`${base(stepKey)}/decision`, { method: 'POST', body: JSON.stringify(body) });
}

export function finishOpenWindowSeries(stepKey: OpenWindowStepKey, body: {
  run_id: string; attempt_token: string;
}): Promise<{
  completed: boolean;
  reward_granted: { stars: number; experience: number } | null;
  summary: { decisions: number; sound: number; shots: number; active_ms: number };
  state: OpenWindowRunState;
}> {
  return apiFetch(`${base(stepKey)}/finish`, { method: 'POST', body: JSON.stringify(body) });
}
