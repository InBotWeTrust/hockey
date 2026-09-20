import { Fragment, useEffect, useMemo, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import type {
  OnboardingRequired,
  OnboardingStep,
  OnboardingTutorialShotResponse,
} from '../api/onboarding.js';
import { TutorialShotStep } from './TutorialShotStep.js';
import {
  beginnerStoryScenes,
  type BeginnerStoryNarrativeScene,
  type BeginnerStoryScene,
} from './beginnerStory.js';

interface BeginnerStoryFlowProps {
  mode: 'required' | 'replay';
  runId?: string;
  required?: OnboardingRequired;
  unlockGoalsRequired: number;
  onCompleted: () => void;
  onClose?: () => void;
}

const replayTutorialStep: Extract<OnboardingStep, { kind: 'tutorial_shot' }> = {
  id: 'story-replay-shot',
  position: 1,
  kind: 'tutorial_shot',
  title: 'Один бросок',
  description: 'Дождись момента и бросай.',
  ctaLabel: 'Дальше',
  tutorial: { shooterFrequency: 0.8, goalieFrequency: 0.65, goalFrequency: 0.55 },
};

const replayTutorialApi = {
  start: async () => ({
    seed: 'story-series-one-replay',
    shotIndex: 1,
    goalieId: 'rookie' as const,
    gameCoreVersion: 1,
    speeds: {
      shooterFrequency: 0.8,
      goalieFrequency: 0.65,
      goalFrequency: 0.55,
    },
    result: null,
    goalConfirmed: false,
  }),
  submit: async (
    _runId: string,
    shot: { claimedResult: 'goal' | 'save' | 'miss' },
  ): Promise<OnboardingTutorialShotResponse> => {
    const result = shot.claimedResult === 'goal' ? 'goal' : 'miss';
    return {
      serverResult: shot.claimedResult,
      nextShotIndex: 2,
      result,
      goalConfirmed: result === 'goal',
    };
  },
};

function nextScene(scene: BeginnerStoryNarrativeScene): BeginnerStoryScene | null {
  if (scene === 'court') return 'car';
  if (scene === 'car') return 'stranger';
  if (scene === 'stranger') return 'mentor';
  if (scene === 'mentor') return 'shot';
  if (scene === 'goal' || scene === 'miss') return 'name';
  if (scene === 'name') return 'threshold';
  if (scene === 'threshold') return 'arena';
  if (scene === 'arena') return 'finale';
  return null;
}

export function BeginnerStoryFlow({
  mode,
  runId,
  required,
  unlockGoalsRequired,
  onCompleted,
  onClose,
}: BeginnerStoryFlowProps): JSX.Element {
  const [scene, setScene] = useState<BeginnerStoryScene>('court');
  const [typedText, setTypedText] = useState('');
  const [typingDone, setTypingDone] = useState(false);
  const [headlights, setHeadlights] = useState(false);
  const scenes = useMemo(() => beginnerStoryScenes(unlockGoalsRequired), [unlockGoalsRequired]);
  const isShot = scene === 'shot';
  const content = isShot ? null : scenes[scene];
  const activeContent = content ?? scenes.court;
  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!content) return;
    setTypedText('');
    setTypingDone(false);
    if (reduceMotion) {
      setTypedText(content.copy);
      setTypingDone(true);
      if (scene === 'car') setHeadlights(true);
      return;
    }

    let index = 0;
    let typingTimer: number | undefined;
    const startDelay = scene === 'court' ? 220 : scene === 'car' ? 560 : scene === 'mentor' ? 260 : 300;
    const startTimer = window.setTimeout(function typeNext() {
      index += 1;
      const nextText = content.copy.slice(0, index);
      setTypedText(nextText);
      if (scene === 'car' && nextText.endsWith('За бортом вспыхивает свет фар.')) {
        setHeadlights(true);
      }
      if (index >= content.copy.length) {
        typingTimer = window.setTimeout(() => setTypingDone(true), 120);
        return;
      }
      const printed = content.copy[index - 1] ?? '';
      const resultPause =
        (scene === 'goal' && nextText.endsWith('Незнакомец едва заметно кивает.')) ||
        (scene === 'miss' && nextText.endsWith('Незнакомец даже не меняется в лице.'));
      const delay = resultPause
        ? 780
        : printed === ','
          ? 120
          : '.:!?'.includes(printed)
            ? 360
            : 22;
      typingTimer = window.setTimeout(typeNext, delay);
    }, startDelay);

    return () => {
      window.clearTimeout(startTimer);
      if (typingTimer !== undefined) window.clearTimeout(typingTimer);
    };
  }, [content, reduceMotion, scene]);

  const tutorialStep =
    required?.steps.find(
      (step): step is Extract<OnboardingStep, { kind: 'tutorial_shot' }> =>
        step.kind === 'tutorial_shot',
    ) ?? replayTutorialStep;

  function advance(): void {
    if (isShot) return;
    const next = nextScene(scene);
    if (next) {
      if (next !== 'car') setHeadlights(false);
      setScene(next);
      return;
    }
    onCompleted();
  }

  function renderLines(lines: string[], reserve = false) {
    return lines.map((line, index) => {
      const threshold = line === String(unlockGoalsRequired) || line === `0 / ${unlockGoalsRequired}`;
      const playerDialogue = scene === 'name' && index === 2;
      const dialogue = line.startsWith('–') || (scene === 'finale' && line.startsWith('«'));
      const className = threshold
        ? 'beginner-story__threshold'
        : playerDialogue
          ? 'beginner-story__dialogue beginner-story__dialogue--player'
          : dialogue
            ? 'beginner-story__dialogue'
            : undefined;
      return (
        <Fragment key={`${reserve ? 'reserve' : 'copy'}-${index}-${line}`}>
          {index > 0 ? '\n' : null}
          <span className={className}>{line}</span>
        </Fragment>
      );
    });
  }

  return (
    <main
      className={`beginner-story beginner-story--${scene}${headlights ? ' beginner-story--headlights' : ''}`}
      aria-label={mode === 'required' ? 'Обязательный онбординг' : 'Путь со двора'}
      data-testid="beginner-story"
    >
      {mode === 'replay' ? (
        <button
          type="button"
          className="icon-btn beginner-story__close"
          aria-label="Закрыть серию"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      ) : null}

      <div className="beginner-story__media" aria-hidden={isShot ? undefined : true}>
        {isShot ? (
          <TutorialShotStep
            runId={mode === 'required' ? (runId ?? '') : 'story-replay'}
            step={tutorialStep}
            goalConfirmed={false}
            onGoalConfirmed={() => undefined}
            onContinue={() => undefined}
            onResult={(result) => setScene(result)}
            showResultCard={false}
            {...(mode === 'replay' ? { tutorialApi: replayTutorialApi } : {})}
          />
        ) : scene === 'car' ? (
          <>
            <img className="beginner-story__image" src={activeContent.image} alt="" />
            <img
              className={`beginner-story__image beginner-story__headlights${headlights ? ' beginner-story__headlights--visible' : ''}`}
              src="/onboarding/story/scene-02-car-on.png"
              alt=""
            />
          </>
        ) : (
          <img className="beginner-story__image" src={activeContent.image} alt={activeContent.alt} />
        )}
      </div>

      {!isShot && content ? (
        <>
          <div className="beginner-story__shade" aria-hidden="true" />
          <section className="beginner-story__copy" aria-label={content.copy}>
            <p className={typingDone ? undefined : 'is-typing'}>
              {renderLines(typedText.split('\n'))}
            </p>
            <p className="beginner-story__copy-reserve" aria-hidden="true">
              {renderLines(content.copy.split('\n'), true)}
            </p>
          </section>
          <button
            className={`beginner-story__cta${typingDone ? ' beginner-story__cta--visible' : ''}`}
            type="button"
            onClick={advance}
            disabled={!typingDone}
          >
            <span>{scene === 'finale' ? content.action : `– ${content.action}`}</span>
            <ArrowRight size={20} aria-hidden="true" />
          </button>
        </>
      ) : null}
    </main>
  );
}
