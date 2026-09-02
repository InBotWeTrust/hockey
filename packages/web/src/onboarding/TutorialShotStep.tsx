import { useCallback, useEffect, useRef, useState } from 'react';
import { PUCK_SPEED_PER_MS } from '@hockey/game-core';
import {
  startOnboardingTutorial,
  submitOnboardingTutorialShot,
  type OnboardingStep,
  type OnboardingTutorialSession,
} from '../api/onboarding.js';
import { PlayView } from '../game/PlayView.js';

interface TutorialState {
  shots: number;
  goals: number;
  nextShotIndex: number;
  goalConfirmed: boolean;
}

interface TutorialShotStepProps {
  runId: string;
  step: Extract<OnboardingStep, { kind: 'tutorial_shot' }>;
  goalConfirmed: boolean;
  canGoBack?: boolean;
  onGoalConfirmed: () => void;
  onBack: () => void;
  onContinue: () => void;
}

function stateFromSession(
  session: OnboardingTutorialSession,
  preservedGoal: boolean,
): TutorialState {
  const goalConfirmed = preservedGoal || session.goalConfirmed;
  return {
    shots: session.shotIndex - 1,
    goals: goalConfirmed ? 1 : 0,
    nextShotIndex: session.shotIndex,
    goalConfirmed,
  };
}

export function TutorialShotStep({
  runId,
  step,
  goalConfirmed: preservedGoal,
  canGoBack = true,
  onGoalConfirmed,
  onBack,
  onContinue,
}: TutorialShotStepProps): JSX.Element {
  const [session, setSession] = useState<OnboardingTutorialSession | null>(null);
  const [state, setState] = useState<TutorialState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [shotError, setShotError] = useState(false);
  const startedRef = useRef(false);
  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const load = useCallback(async (): Promise<void> => {
    if (startedRef.current) return;
    startedRef.current = true;
    setLoading(true);
    setError(false);
    try {
      const nextSession = await startOnboardingTutorial(runId);
      setSession(nextSession);
      setState(stateFromSession(nextSession, preservedGoal));
      if (nextSession.goalConfirmed && !preservedGoal) onGoalConfirmed();
    } catch {
      startedRef.current = false;
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [onGoalConfirmed, preservedGoal, runId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading)
    return (
      <div className="onboarding-flow__tutorial-status" role="status">
        Загружаем площадку…
      </div>
    );
  if (error || !session || !state) {
    return (
      <div className="onboarding-flow__tutorial-status" role="alert">
        <span>Не удалось загрузить учебную площадку.</span>
        <button className="btn btn--cta" type="button" onClick={() => void load()}>
          Повторить
        </button>
      </div>
    );
  }

  return (
    <section
      className={`onboarding-tutorial${state.goalConfirmed ? ' onboarding-tutorial--confirmed' : ''}`}
      aria-label={step.title}
    >
      <p className="onboarding-tutorial__instruction">Поймай момент и забей шайбу</p>
      <div className="onboarding-tutorial__rink">
        <PlayView<TutorialState>
          suppressedByModal={false}
          showIceCar={false}
          onBack={onBack}
          hideBackAction
          reduceMotion={reduceMotion}
          active
          seed={session.seed}
          goalieId={session.goalieId}
          periodNumber={1}
          speedOverrides={{
            shooterFreq: session.speeds.shooterFrequency,
            goalieFreq: session.speeds.goalieFrequency,
            goalFreq: session.speeds.goalFrequency,
            puckSpeed: PUCK_SPEED_PER_MS,
          }}
          goals={state.goals}
          shots={state.shots}
          shotsTotal={undefined}
          optimisticAddShot={() =>
            setState((current) => (current ? { ...current, shots: current.shots + 1 } : current))
          }
          submitShot={async ({ shotIndex, input, claimedResult }) => {
            const response = await submitOnboardingTutorialShot(runId, {
              shotIndex,
              input: {
                tapTime: input.tapTime,
                shooterTapTime: input.shooterTapTime ?? input.tapTime,
              },
              claimedResult,
            });
            const nextState: TutorialState = {
              shots: response.nextShotIndex - 1,
              goals: response.goalConfirmed ? 1 : 0,
              nextShotIndex: response.nextShotIndex,
              goalConfirmed: response.goalConfirmed,
            };
            if (response.goalConfirmed && !state.goalConfirmed) onGoalConfirmed();
            return { serverResult: response.serverResult, state: nextState };
          }}
          applyState={setState}
          longCourtBackground="/sprites/new-light-court.webp"
          hideScoreboard
          resultCopy={{
            save: 'Ещё раз',
            miss: 'Ещё раз',
            post: 'Ещё раз',
            goal: 'Первая шайба!',
          }}
          onSubmitError={() => setShotError(true)}
        />
      </div>
      {shotError && (
        <div className="onboarding-flow__error" role="alert">
          <span>Не удалось отправить бросок. Проверьте соединение.</span>
          <button className="btn btn--ghost" type="button" onClick={() => setShotError(false)}>
            Попробовать ещё раз
          </button>
        </div>
      )}
      <div className="onboarding-flow__copy">
        <h1>{step.title}</h1>
        <p>{step.description}</p>
      </div>
      <div className="onboarding-flow__actions">
        {canGoBack && (
          <button className="btn btn--ghost" type="button" onClick={onBack}>
            Назад
          </button>
        )}
        <button
          className="btn btn--cta"
          type="button"
          onClick={onContinue}
          disabled={!state.goalConfirmed}
        >
          {step.ctaLabel}
        </button>
      </div>
    </section>
  );
}
