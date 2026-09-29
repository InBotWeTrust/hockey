import bank from './openWindowObservationBank.json' with { type: 'json' };
import { GAME_CORE_VERSION } from './version.js';
import { resolveOpenWindowShot } from './openWindowTraining.js';

export type ObservationStepKey = 'notice_frame' | 'notice_motion' | 'notice_independent';
export type ObservationInput =
  | { type: 'classify'; answer: 'open' | 'closed' }
  | { type: 'mark'; tapTimeMs: number }
  | { type: 'skip' }
  | { type: 'observed' };
export type ObservationEvaluation = 'good_mark' | 'early' | 'late' | 'closed' |
  'good_skip' | 'missed_opening' | 'observed';

export interface ObservationScene {
  id: string;
  stepKey: ObservationStepKey;
  source: 'authored' | 'recorded';
  recordingKey?: string;
  sessionSeed: string;
  goalieId: string;
  shotIndex: number;
  startMs: number;
  endMs: number;
  decisionMs: number;
  opening: { startMs: number; endMs: number } | null;
  bankVersion: number;
  gameCoreVersion: number;
  explanation: string;
}

export const OBSERVATION_BANK_VERSION = 1;

export function validateObservationScene(scene: ObservationScene): void {
  if (!Number.isFinite(scene.startMs) || !Number.isFinite(scene.endMs) ||
    scene.endMs <= scene.startMs || scene.decisionMs < scene.startMs ||
    scene.decisionMs > scene.endMs) throw new Error(`Invalid observation decision time: ${scene.id}`);
  if (scene.opening && (scene.opening.startMs < scene.startMs ||
    scene.opening.endMs > scene.endMs || scene.opening.startMs > scene.opening.endMs)) {
    throw new Error(`Invalid observation opening: ${scene.id}`);
  }
  if (scene.bankVersion !== OBSERVATION_BANK_VERSION ||
    scene.gameCoreVersion !== GAME_CORE_VERSION) {
    throw new Error(`Stale observation scene: ${scene.id}`);
  }
  if (scene.stepKey === 'notice_motion' && scene.source === 'authored') {
    const atFrame = resolveOpenWindowShot({ ...scene, targetMs: scene.decisionMs },
      scene.decisionMs).type;
    if ((scene.opening !== null) !== (atFrame === 'goal')) {
      throw new Error(`Observation frame contradicts its answer: ${scene.id}`);
    }
  }
}

export function getObservationScene(stepKey: ObservationStepKey,
  variant: number): ObservationScene {
  const scene = (bank as ObservationScene[]).filter((candidate) =>
    candidate.stepKey === stepKey)[variant];
  if (!scene || !Number.isInteger(variant) || variant < 0) {
    throw new RangeError(`Unknown observation scene: ${stepKey}/${variant}`);
  }
  validateObservationScene(scene);
  return scene;
}

export function evaluateObservationDecision(scene: ObservationScene,
  input: ObservationInput): ObservationEvaluation {
  if (input.type === 'observed') return 'observed';
  if (input.type === 'classify') {
    const isOpen = scene.opening !== null &&
      scene.decisionMs >= scene.opening.startMs &&
      scene.decisionMs <= scene.opening.endMs;
    return input.answer === 'open'
      ? isOpen ? 'good_mark' : 'closed'
      : isOpen ? 'missed_opening' : 'good_skip';
  }
  if (input.type === 'skip') return scene.opening ? 'missed_opening' : 'good_skip';
  if (!scene.opening) return 'closed';
  if (input.tapTimeMs < scene.opening.startMs) return 'early';
  if (input.tapTimeMs > scene.opening.endMs) return 'late';
  return 'good_mark';
}
