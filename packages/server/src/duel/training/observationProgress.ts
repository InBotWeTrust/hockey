import { evaluateObservationDecision, type ObservationEvaluation,
  type ObservationInput, type ObservationScene, type ObservationStepKey } from '@hockey/game-core';

export function validateObservationSubmission(scene: ObservationScene, input: ObservationInput,
  elapsedMs: number): ObservationEvaluation {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new RangeError('Invalid attempt time');
  const sceneTime = scene.startMs + elapsedMs;
  if (input.type === 'classify' || input.type === 'observed') {
    if (sceneTime < scene.decisionMs) throw new RangeError('Decision too early');
  } else if (input.type === 'skip') {
    if (sceneTime < scene.endMs - 250) throw new RangeError('Skip too early');
  } else if (input.tapTimeMs < scene.startMs || input.tapTimeMs > scene.endMs ||
    Math.abs(sceneTime - input.tapTimeMs) > 750) {
    throw new RangeError('Invalid mark time');
  }
  return evaluateObservationDecision(scene, input);
}

export function advanceObservationProgress(stepKey: ObservationStepKey, variant: number,
  evaluation: ObservationEvaluation): { nextVariant: number; completed: boolean; sound: boolean } {
  const sound = evaluation === 'observed' || evaluation === 'good_mark' ||
    evaluation === 'good_skip';
  if (stepKey === 'notice_frame') return { nextVariant: 0, completed: sound, sound };
  if (stepKey === 'notice_motion') {
    const correct = variant === 0 ? evaluation === 'good_mark' : evaluation === 'good_skip';
    return { nextVariant: correct ? Math.min(1, variant + 1) : variant,
      completed: variant === 1 && correct, sound: correct };
  }
  return { nextVariant: Math.min(2, variant + 1), completed: variant >= 2, sound };
}
