import { useCallback, useEffect, useRef, useState } from 'react';
import { PUCK_SPEED_PER_MS, resolveEmptyGoalShot } from '@hockey/game-core';
import {
  startOnboardingTutorial,
  submitOnboardingTutorialShot,
  type OnboardingStep,
  type OnboardingTutorialSession,
  type OnboardingTutorialShotResponse,
} from '../api/onboarding.js';
import { PlayView, TRAINING_STREET_PLAYER_OPTIONS } from '../game/PlayView.js';
import { OnboardingCopy } from './OnboardingCopy.js';

type TutorialResult = 'goal' | 'miss';
interface TutorialState {
  shots: number;
  goals: number;
  result: TutorialResult | null;
}
interface TutorialShotStepProps {
  runId: string;
  step: Extract<OnboardingStep, { kind: 'tutorial_shot' }>;
  goalConfirmed: boolean;
  onGoalConfirmed: () => void;
  onContinue: () => void;
  tutorialApi?: {
    start: (runId: string) => Promise<OnboardingTutorialSession & { runId?: string }>;
    submit: (
      runId: string,
      shot: {
        shotIndex: number;
        input: { tapTime: number; shooterTapTime: number };
        claimedResult: 'goal' | 'save' | 'miss';
      },
    ) => Promise<OnboardingTutorialShotResponse>;
  };
}

const resultContent = {
  goal: {
    title: 'Неплохо',
    description:
      'Шайба влетает в ворота. Незнакомец едва заметно кивает.\n\n— Попасть один раз может каждый. А вот возвращаться на лёд каждый день — это уже характер.',
    cta: 'Что дальше?',
    image: '/onboarding/reference/beginner-result-goal.webp',
  },
  miss: {
    title: 'Не попал',
    description:
      'Шайба проходит рядом с воротами. Незнакомец смотрит тебе вслед, но не смеётся.\n\n— Неважно, с какого броска ты начал. Важно, придёшь ли ты завтра.',
    cta: 'Я приду',
    image: '/onboarding/reference/beginner-result-miss.webp',
  },
} as const;

export function TutorialShotStep({
  runId,
  step,
  onGoalConfirmed,
  onContinue,
  tutorialApi,
}: TutorialShotStepProps): JSX.Element {
  const [session, setSession] = useState<OnboardingTutorialSession | null>(null);
  const [state, setState] = useState<TutorialState | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [shotError, setShotError] = useState(false);
  const tutorialRunId = useRef(runId);
  const authoritativeResult = useRef<TutorialResult | null>(null);
  const started = useRef(false);
  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const load = useCallback(async (): Promise<void> => {
    if (started.current) return;
    started.current = true;
    setLoading(true);
    setError(false);
    try {
      const next = await (tutorialApi?.start(runId) ?? startOnboardingTutorial(runId));
      tutorialRunId.current =
        (next as OnboardingTutorialSession & { runId?: string }).runId ?? runId;
      const restoredResult = next.result ?? (next.goalConfirmed ? 'goal' : null);
      authoritativeResult.current = restoredResult;
      setSession(next);
      setState({
        shots: next.shotIndex - 1,
        goals: restoredResult === 'goal' ? 1 : 0,
        result: restoredResult,
      });
      setShowResult(restoredResult !== null);
      if (restoredResult === 'goal') onGoalConfirmed();
    } catch {
      started.current = false;
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [onGoalConfirmed, runId, tutorialApi]);
  useEffect(() => {
    void load();
  }, [load]);

  if (loading)
    return (
      <div className="onboarding-flow__tutorial-status" role="status">
        Загружаем площадку…
      </div>
    );
  if (error || !session || !state)
    return (
      <div className="onboarding-flow__tutorial-status" role="alert">
        <span>Не удалось загрузить учебную площадку.</span>
        <button className="btn btn--cta" type="button" onClick={() => void load()}>
          Повторить
        </button>
      </div>
    );
  if (showResult && state.result) {
    const content = resultContent[state.result];
    return (
      <section
        className="onboarding-tutorial onboarding-tutorial--result"
        aria-label={content.title}
      >
        <img className="onboarding-flow__image" src={content.image} alt={content.title} />
        <OnboardingCopy title={content.title} description={content.description} />
        <div className="onboarding-flow__actions">
          <button className="btn btn--cta" type="button" onClick={onContinue}>
            {content.cta}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="onboarding-tutorial onboarding-tutorial--playing" aria-label={step.title}>
      <div className="onboarding-tutorial__rink">
        <PlayView<TutorialState>
          suppressedByModal={false}
          showIceCar={false}
          onBack={() => undefined}
          hideBackAction
          hideGoalie
          hideSoundAction
          playerOptions={TRAINING_STREET_PLAYER_OPTIONS}
          reduceMotion={reduceMotion}
          active={!shotError}
          primaryActionBlocked={state.result !== null}
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
          shotsTotal={1}
          optimisticAddShot={() =>
            setState((current) => (current ? { ...current, shots: 1 } : current))
          }
          shotResolver={({ input, goalieConfig, phaseOffsets }) =>
            resolveEmptyGoalShot(input, goalieConfig, phaseOffsets)
          }
          submitShot={async ({ shotIndex, input, claimedResult }) => {
            try {
              const payload = {
                shotIndex,
                input: {
                  tapTime: input.tapTime,
                  shooterTapTime: input.shooterTapTime ?? input.tapTime,
                },
                claimedResult,
              };
              const response = await (tutorialApi?.submit(tutorialRunId.current, payload) ??
                submitOnboardingTutorialShot(tutorialRunId.current, payload));
              const result = response.result ?? (response.goalConfirmed ? 'goal' : 'miss');
              authoritativeResult.current = result;
              const nextState = {
                shots: 1,
                goals: result === 'goal' ? 1 : 0,
                result,
              };
              if (result === 'goal') onGoalConfirmed();
              return { serverResult: response.serverResult, state: nextState };
            } catch (submitError) {
              setShotError(true);
              throw submitError;
            }
          }}
          applyState={setState}
          onResultComplete={() => {
            if (authoritativeResult.current) setShowResult(true);
          }}
          hideScoreboard
          hideRinkScoreboard
          resultCopy={{ miss: 'Мимо', post: 'Мимо', goal: 'Гол!' }}
        />
      </div>
      {shotError && (
        <div className="onboarding-flow__error" role="alert">
          <span>Не удалось сохранить бросок.</span>
          <button className="btn btn--ghost" type="button" onClick={() => window.location.reload()}>
            Повторить загрузку
          </button>
        </div>
      )}
    </section>
  );
}
