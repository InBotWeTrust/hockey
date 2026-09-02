import { useEffect, useRef, useState } from 'react';
import {
  completeOnboarding,
  recordStepView,
  type OnboardingRequired,
  type OnboardingRequiredResponse,
} from '../api/onboarding.js';
import './onboarding.css';
import { TutorialShotStep } from './TutorialShotStep.js';

interface OnboardingFlowProps {
  runId: string;
  required: OnboardingRequired;
  onCompleted: (result: OnboardingRequiredResponse) => void;
}

export function OnboardingFlow({ runId, required, onCompleted }: OnboardingFlowProps): JSX.Element {
  const [stepIndex, setStepIndex] = useState(0);
  const [brokenImage, setBrokenImage] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<'view' | 'complete' | null>(null);
  const reachedSteps = useRef(new Set<string>());
  const viewedSteps = useRef(new Set<string>());
  const viewRequests = useRef(new Map<string, Promise<void>>());
  const confirmedTutorialSteps = useRef(new Set<string>());
  const step = required.steps[stepIndex];

  function ensureStepView(stepId: string): Promise<void> {
    if (viewedSteps.current.has(stepId)) return Promise.resolve();
    const activeRequest = viewRequests.current.get(stepId);
    if (activeRequest) return activeRequest;

    const request = recordStepView(runId, stepId)
      .then(() => {
        viewedSteps.current.add(stepId);
      })
      .finally(() => {
        viewRequests.current.delete(stepId);
      });
    viewRequests.current.set(stepId, request);
    return request;
  }

  useEffect(() => {
    if (!step) return;
    reachedSteps.current.add(step.id);
    void ensureStepView(step.id).catch(() => {
      // Viewing analytics is deliberately best-effort. The server still validates
      // the evidence before completion, where this request is retried as a gate.
    });
  }, [runId, step]);

  useEffect(() => setBrokenImage(false), [step?.id]);

  if (!step) {
    return <OnboardingStatus message="Онбординг пока недоступен" />;
  }

  const lastStep = stepIndex === required.steps.length - 1;

  async function finish(): Promise<void> {
    setCompleting(true);
    setLifecycleError(null);
    try {
      const reached = [...reachedSteps.current];
      await Promise.allSettled(reached.map(ensureStepView));
      try {
        await Promise.all(reached.map(ensureStepView));
      } catch {
        setLifecycleError('view');
        return;
      }
      const result = await completeOnboarding(runId);
      onCompleted(result);
    } catch {
      setLifecycleError('complete');
    } finally {
      setCompleting(false);
    }
  }

  function advance(): void {
    if (lastStep) {
      void finish();
      return;
    }
    setStepIndex((current) => current + 1);
  }

  return (
    <main className="onboarding-flow" aria-label="Обязательный онбординг">
      <div className="onboarding-flow__progress" aria-live="polite">
        {stepIndex + 1} из {required.steps.length}
      </div>
      <section className="onboarding-flow__content">
        {step.kind === 'informational' ? (
          brokenImage ? (
            <div
              className="onboarding-flow__image-fallback"
              role="img"
              aria-label="Изображение временно недоступно"
            >
              Изображение временно недоступно
            </div>
          ) : (
            <img
              className="onboarding-flow__image"
              src={step.imageUrl}
              alt={step.title}
              onError={() => setBrokenImage(true)}
            />
          )
        ) : (
          <TutorialShotStep
            runId={runId}
            step={step}
            goalConfirmed={confirmedTutorialSteps.current.has(step.id)}
            onGoalConfirmed={() => confirmedTutorialSteps.current.add(step.id)}
            onBack={() => setStepIndex((current) => current - 1)}
            onContinue={advance}
          />
        )}
        {step.kind === 'informational' && (
          <div className="onboarding-flow__copy">
            <h1>{step.title}</h1>
            <p>{step.description}</p>
          </div>
        )}
      </section>
      {step.kind === 'informational' && (
        <div className="onboarding-flow__footer">
          {lifecycleError && (
            <div className="onboarding-flow__error" role="alert">
              <span>
                {lifecycleError === 'view'
                  ? 'Не удалось сохранить прогресс. Проверьте соединение.'
                  : 'Не удалось завершить онбординг. Проверьте соединение.'}
              </span>
              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => void finish()}
                disabled={completing}
              >
                Повторить
              </button>
            </div>
          )}
          <div className="onboarding-flow__actions">
            {stepIndex > 0 && (
              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => setStepIndex((current) => current - 1)}
                disabled={completing}
              >
                Назад
              </button>
            )}
            <button className="btn btn--cta" type="button" onClick={advance} disabled={completing}>
              {completing ? 'Завершаем…' : step.ctaLabel}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export function OnboardingStatus({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}): JSX.Element {
  return (
    <main className="onboarding-flow onboarding-flow--status">
      <div className="onboarding-flow__status" role={retry ? 'alert' : 'status'}>
        <p>{message}</p>
        {retry && (
          <button className="btn btn--cta" type="button" onClick={retry}>
            Повторить
          </button>
        )}
      </div>
    </main>
  );
}
