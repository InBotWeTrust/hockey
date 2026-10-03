import { prepareStoryImages, storyImagesReady, storyImageUrl } from './storyImages.js';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
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
  completing?: boolean;
  completionError?: string;
  onRetry?: () => void;
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

const STORY_TYPING_DELAY_MS = 34;
const STORY_COMMA_PAUSE_MS = 170;
const STORY_PUNCTUATION_PAUSE_MS = 580;
const STORY_RESULT_PAUSE_MS = 1_100;

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
  completing = false,
  completionError,
  onRetry,
}: BeginnerStoryFlowProps): JSX.Element {
  const [loadingScene, setLoadingScene] = useState(false);
  const [imageError, setImageError] = useState(false);
  const alive = useRef(true);
  const navigation = useRef(0);
  const pendingScene = useRef<BeginnerStoryScene | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; navigation.current += 1; }; }, []);
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
      if (scene === 'car' && nextText.endsWith('На льду стало светлее')) {
        setHeadlights(true);
      }
      if (index >= content.copy.length) {
        typingTimer = window.setTimeout(() => setTypingDone(true), 120);
        return;
      }
      const printed = content.copy[index - 1] ?? '';
      const resultPause =
        (scene === 'goal' && nextText.endsWith('Мужчина едва заметно кивает.')) ||
        (scene === 'miss' && nextText.endsWith('Незнакомец даже не меняется в лице.'));
      const delay = resultPause
        ? STORY_RESULT_PAUSE_MS
        : printed === ','
          ? STORY_COMMA_PAUSE_MS
          : '.:!?'.includes(printed)
            ? STORY_PUNCTUATION_PAUSE_MS
            : STORY_TYPING_DELAY_MS;
      typingTimer = window.setTimeout(typeNext, delay);
    }, startDelay);

    return () => {
      window.clearTimeout(startTimer);
      if (typingTimer !== undefined) window.clearTimeout(typingTimer);
    };
  }, [content, reduceMotion, scene]);

  const numberVisible = scene === 'threshold' && (reduceMotion || typedText.includes(`\n\n${unlockGoalsRequired}\n`));
  const arenaVisible = scene === 'arena' && (reduceMotion || typedText.includes('представляете'));
  const turned = scene === 'name' && (reduceMotion || typedText.includes('смотрит через плечо.'));
  const puckVisible = (scene === 'goal' || scene === 'miss') && (reduceMotion || typedText.includes(scene === 'goal' ? 'Шайба влетает в ворота.' : 'Шайба проходит рядом с воротами.'));
  const mentorGesture = scene === 'mentor' && (reduceMotion || typedText.includes('– Только'));
  const strangerVisible = scene === 'stranger' && (reduceMotion || typedText.includes('Из машины выходит мужчина.'));
  const finaleDark = scene === 'finale' && (reduceMotion || typedText.includes('На площадке снова стало темно и тихо.'));

  const tutorialStep =
    required?.steps.find(
      (step): step is Extract<OnboardingStep, { kind: 'tutorial_shot' }> =>
        step.kind === 'tutorial_shot',
    ) ?? replayTutorialStep;

  function imagesFor(target: BeginnerStoryScene): string[] {
    if (target === 'shot') return [];
    const extra: Partial<Record<BeginnerStoryNarrativeScene, string>> = {
      stranger: 'scene-03-stranger-empty.webp', mentor: 'scene-04-mentor-gesture-v2.webp',
      goal: 'scene-06-goal-empty.webp', miss: 'scene-06-miss-empty.webp',
      name: 'scene-07-back.webp', threshold: 'scene-08-threshold-empty.webp', arena: 'scene-09-arena-empty.webp',
    };
    return [scenes[target].image, ...(extra[target] ? [`/onboarding/story/${extra[target]}`] : [])];
  }

  useEffect(() => {
    let active = true;
    const next = scene === 'shot' ? null : nextScene(scene);
    // Finish current frames first; prepare only the immediately following scene.
    void prepareStoryImages(imagesFor(scene)).then(() => {
      if (!alive.current || !active) return;
      const following = scene === 'shot' ? [...imagesFor('goal'), ...imagesFor('miss')] : next ? imagesFor(next) : [];
      return prepareStoryImages(following);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [scene, scenes]);

  function transitionTo(next: BeginnerStoryScene): void {
    if (loadingScene) return;
    pendingScene.current = next;
    const token = ++navigation.current;
    const show = () => {
      if (!alive.current || token !== navigation.current) return;
      setLoadingScene(false);
      setImageError(false);
      setTypingDone(false);
      setTypedText('');
      setHeadlights(false);
      setScene(next);
    };
    if (storyImagesReady(imagesFor(next))) { show(); return; }
    setLoadingScene(true);
    setImageError(false);
    void prepareStoryImages(imagesFor(next)).then(show).catch(() => {
      if (!alive.current || token !== navigation.current) return;
      setLoadingScene(false);
      setImageError(true);
    });
  }

  function advance(): void {
    if (isShot) return;
    const next = nextScene(scene);
    if (next) transitionTo(next);
    else onCompleted();
  }

  function renderLines(lines: string[]) {
    let characterIndex = 0;
    return lines.map((line, index) => {
      const threshold = line === String(unlockGoalsRequired) || line === `0 / ${unlockGoalsRequired}`;
      const dialogue = /^[-–]/.test(line) || (scene === 'finale' && line.startsWith('«'));
      const className = threshold
        ? 'beginner-story__threshold'
        : dialogue
          ? 'beginner-story__dialogue'
          : undefined;
      const narrationStart = line.indexOf('говорит незнакомец');
      const lineStart = characterIndex;
      const words = line.split(/(\s+)/);
      // Keep the last two words together so the final line cannot contain a lone word.
      if (!threshold && words.length >= 3) words.splice(-3, 3, words.slice(-3).join(''));
      return (
        <Fragment key={`copy-${index}`}>
          {index > 0 ? '\n' : null}
          <span className={className}>
            {words.map((word, wordIndex) => {
              const start = characterIndex;
              characterIndex += word.length;
              if (wordIndex === words.length - 1) characterIndex += 1;
              return (
                <span key={wordIndex} className={/\S/.test(word)
                  ? `beginner-story__word${scene === 'mentor' && narrationStart >= 0 && start - lineStart >= narrationStart ? ' beginner-story__narration' : ''}`
                  : undefined}>
                  {word.split('').map((character, offset) => (
                    <span key={offset} style={{ visibility: start + offset < typedText.length ? 'visible' : 'hidden' }}>
                      {character}
                    </span>
                  ))}
                </span>
              );
            })}
          </span>
        </Fragment>
      );
    });
  }

  return (
    <main
      className={`beginner-story beginner-story--${scene}${headlights ? ' beginner-story--headlights' : ''}${finaleDark ? ' beginner-story--dark' : ''}${strangerVisible ? ' beginner-story--stranger-visible' : ''}${mentorGesture ? ' beginner-story--mentor-gesture' : ''}${puckVisible ? ' beginner-story--puck-visible' : ''}${turned ? ' beginner-story--turned' : ''}${numberVisible ? ' beginner-story--number-visible' : ''}${arenaVisible ? ' beginner-story--arena-visible' : ''}`}
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

      <div key={scene} className="beginner-story__media" aria-hidden={isShot ? undefined : true}>
        {isShot ? (
          <TutorialShotStep
            runId={mode === 'required' ? (runId ?? '') : 'story-replay'}
            step={tutorialStep}
            goalConfirmed={false}
            onGoalConfirmed={() => undefined}
            onContinue={() => undefined}
            onResult={transitionTo}
            showResultCard={false}
            {...(mode === 'replay' ? { tutorialApi: replayTutorialApi } : {})}
          />
        ) : scene === 'threshold' || scene === 'arena' ? (
          <>
            <img className="beginner-story__image" decoding="async" src={storyImageUrl(scene === 'threshold' ? '/onboarding/story/scene-08-threshold-empty.webp' : '/onboarding/story/scene-09-arena-empty.webp')} alt="" />
            <img className={`beginner-story__image beginner-story__${scene}-reveal`} src={storyImageUrl(activeContent.image)} alt={activeContent.alt} />
          </>
        ) : scene === 'name' ? (
          <>
            <img className="beginner-story__image" decoding="async" src={storyImageUrl("/onboarding/story/scene-07-back.webp")} alt="" />
            <img className="beginner-story__image beginner-story__turn-reveal" src={storyImageUrl(activeContent.image)} alt={activeContent.alt} />
          </>
        ) : scene === 'goal' || scene === 'miss' ? (
          <>
            <img className="beginner-story__image" decoding="async" src={storyImageUrl(`/onboarding/story/scene-06-${scene}-empty.webp`)} alt="" />
            <img className="beginner-story__image beginner-story__puck-reveal" src={storyImageUrl(activeContent.image)} alt={activeContent.alt} />
          </>
        ) : scene === 'mentor' ? (
          <>
            <img className="beginner-story__image" decoding="async" src={storyImageUrl(activeContent.image)} alt={activeContent.alt} />
            <img className="beginner-story__image beginner-story__mentor-gesture" src={storyImageUrl("/onboarding/story/scene-04-mentor-gesture-v2.webp")} alt="" />
          </>
        ) : scene === 'stranger' ? (
          <>
            <img className="beginner-story__image" decoding="async" src={storyImageUrl("/onboarding/story/scene-03-stranger-empty.webp")} alt="" />
            <img className="beginner-story__image beginner-story__stranger-reveal" src={storyImageUrl(activeContent.image)} alt={activeContent.alt} />
          </>
        ) : scene === 'car' ? (
          <>
            <img className="beginner-story__image" decoding="async" src={storyImageUrl(activeContent.image)} alt="" />
            <svg
              className={`beginner-story__headlights${headlights ? ' beginner-story__headlights--visible' : ''}`}
              data-testid="story-headlight-glow"
              viewBox="0 0 941 1672"
              preserveAspectRatio="xMidYMid slice"
              aria-hidden="true"
            >
              <defs>
                <radialGradient id="story-headlight-halo">
                  <stop offset="0" stopColor="#fffef0" stopOpacity="1" />
                  <stop offset="0.18" stopColor="#fff3bd" stopOpacity="0.9" />
                  <stop offset="1" stopColor="#ffe3a0" stopOpacity="0" />
                </radialGradient>
              </defs>
              <ellipse cx="738" cy="566" rx="58" ry="42" fill="url(#story-headlight-halo)" />
              <ellipse cx="899" cy="568" rx="43" ry="36" fill="url(#story-headlight-halo)" />
              <ellipse cx="743" cy="637" rx="92" ry="20" fill="url(#story-headlight-halo)" opacity="0.4" />
              <ellipse cx="890" cy="646" rx="63" ry="17" fill="url(#story-headlight-halo)" opacity="0.35" />
            </svg>
          </>
        ) : (
          <img className="beginner-story__image" decoding="async" src={storyImageUrl(activeContent.image)} alt={activeContent.alt} />
        )}
      </div>

      {isShot && (loadingScene || imageError) ? (
        <div className="beginner-story__completion-error" role="status">
          {loadingScene ? 'Загружаем результат…' : <button type="button" onClick={() => { if (pendingScene.current) transitionTo(pendingScene.current); }}>Повторить загрузку результата</button>}
        </div>
      ) : null}
      {scene === 'court' || scene === 'arena' ? (
        <div className="beginner-story__snow" data-testid="story-snow" aria-hidden="true">
          {Array.from({ length: 18 }, (_, index) => (
            <i key={index} style={{ left: `${(index * 37) % 100}%`, animationDelay: `${-index * 0.73}s`, animationDuration: `${8 + index % 5}s`, width: `${2 + index % 3}px`, height: `${2 + index % 3}px` }} />
          ))}
        </div>
      ) : null}

      {!isShot && content ? (
        <>
          <div className="beginner-story__shade" aria-hidden="true" />
          <section className="beginner-story__copy" aria-label={content.copy}>
            <p className={typingDone ? undefined : 'is-typing'}>
              {renderLines(content.copy.split('\n'))}
            </p>
          </section>
          <button
            key={scene}
            className={`beginner-story__cta${typingDone ? ' beginner-story__cta--visible' : ''}`}
            type="button"
            onClick={advance}
            disabled={!typingDone || completing || loadingScene}
          >
            <span>
              {scene === 'finale' && completing
                ? 'Завершаем…'
                : loadingScene ? 'Загружаем…' : imageError ? 'Повторить загрузку' : content.action}
            </span>
            <ArrowRight size={20} aria-hidden="true" />
          </button>
          {imageError ? <div role="alert" className="beginner-story__completion-error">Не удалось загрузить следующий кадр. Попробуй ещё раз.</div> : null}
          {scene === 'finale' && completionError ? (
            <div className="beginner-story__completion-error" role="alert">
              <span>{completionError}</span>
              <button type="button" onClick={onRetry} disabled={completing}>
                Повторить
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
