import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { getAmateurStoryScenes, type AmateurStoryScene } from './amateurStory.js';
import { prepareStoryImages, storyImagesReady, storyImageUrl } from './storyImages.js';
import './onboarding.css';

interface Props {
  mode: 'required' | 'replay';
  unlockGoalsRequired?: number;
  onCompleted: () => void;
  onClose?: () => void;
  completing?: boolean;
  completionError?: string;
  onRetry?: () => void;
}
const images = (scene: AmateurStoryScene) => [scene.imageA, scene.imageB];

export function AmateurStoryFlow(props: Props): JSX.Element {
  const scenes = useMemo(
    () => getAmateurStoryScenes(props.unlockGoalsRequired ?? 300),
    [props.unlockGoalsRequired],
  );
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const active = useRef(true);
  const transitioning = useRef(false);
  const scene = scenes[index]!;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void prepareStoryImages(images(scene))
      .then(() => {
        const next = scenes[index + 1];
        if (!cancelled && next) void prepareStoryImages(images(next)).catch(() => undefined);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [index, scene, scenes]);

  async function advance(): Promise<void> {
    if (transitioning.current || props.completing) return;
    const next = scenes[index + 1];
    if (!next) {
      props.onCompleted();
      return;
    }
    transitioning.current = true;
    setLoadError(false);
    try {
      if (!storyImagesReady(images(next))) {
        setLoading(true);
        await prepareStoryImages(images(next));
      }
      if (active.current) setIndex(index + 1);
    } catch {
      if (active.current) setLoadError(true);
    } finally {
      transitioning.current = false;
      if (active.current) setLoading(false);
    }
  }
  // A keyed scene owns typing and frame state. The next scene can never inherit frame B.
  return (
    <AmateurStorySceneView
      key={`${scene.id}:${props.unlockGoalsRequired ?? 300}`}
      {...props}
      scene={scene}
      loading={loading}
      loadError={loadError}
      advance={() => void advance()}
    />
  );
}

function AmateurStorySceneView({
  scene,
  mode,
  onClose,
  completing,
  completionError,
  onRetry,
  loading,
  loadError,
  advance,
}: Props & {
  scene: AmateurStoryScene;
  loading: boolean;
  loadError: boolean;
  advance: () => void;
}): JSX.Element {
  const reducedMotion =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [count, setCount] = useState(reducedMotion ? scene.copy.length : 0);
  const [ready, setReady] = useState(() => storyImagesReady(images(scene)));
  const [imageError, setImageError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    if (ready) return;
    setImageError(false);
    void prepareStoryImages(images(scene))
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setImageError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, retry, scene]);
  useEffect(() => {
    if (!ready || reducedMotion) return;
    let current = 0;
    let timer: number;
    const type = () => {
      current += 1;
      setCount(current);
      if (current >= scene.copy.length) return;
      const prefix = scene.copy.slice(0, current);
      const pause = prefix.endsWith(scene.cue)
        ? 850
        : /[.!?]$/.test(prefix)
          ? 420
          : prefix.endsWith(',')
            ? 120
            : 25;
      timer = window.setTimeout(type, pause);
    };
    timer = window.setTimeout(type, 300);
    return () => window.clearTimeout(timer);
  }, [ready, reducedMotion, scene]);
  const revealed = reducedMotion || count >= scene.copy.indexOf(scene.cue) + scene.cue.length;
  const done = ready && count === scene.copy.length;
  let position = 0;
  const lines = scene.copy.split('\n').map((line, lineIndex) => {
    const words = line.split(/(\s+)/);
    if (words.length >= 3) words.splice(-3, 3, words.slice(-3).join(''));
    const dialogue = line.startsWith('–');
    return (
      <Fragment key={lineIndex}>
        {lineIndex > 0 ? '\n' : null}
        <span className={dialogue ? 'beginner-story__dialogue' : undefined}>
          {words.map((word, wordIndex) => {
            const start = position;
            position += word.length;
            return (
              <span
                key={wordIndex}
                className={/\S/.test(word) ? 'beginner-story__word' : undefined}
              >
                {Array.from(word).map((character, offset) => (
                  <span
                    key={offset}
                    style={{ visibility: start + offset < count ? 'visible' : 'hidden' }}
                  >
                    {character}
                  </span>
                ))}
              </span>
            );
          })}
        </span>
        {(() => {
          position += 1;
          return null;
        })()}
      </Fragment>
    );
  });
  return (
    <main
      className="beginner-story amateur-story"
      aria-label={mode === 'required' ? 'Обязательный онбординг' : 'Обещанный разговор'}
      data-testid="amateur-story"
      data-scene={scene.id}
      data-frame={revealed ? 'b' : 'a'}
      data-typed={count}
    >
      {mode === 'replay' && (
        <button
          className="icon-btn beginner-story__close"
          type="button"
          aria-label="Закрыть серию"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      )}
      {ready && (
        <div className="beginner-story__media" aria-hidden="true">
          <img
            className="beginner-story__image"
            src={storyImageUrl(scene.imageA)}
            alt=""
            decoding="async"
          />
          <img
            className={`beginner-story__image amateur-story__frame-b${revealed ? ' amateur-story__frame-b--visible' : ''}`}
            src={storyImageUrl(scene.imageB)}
            alt=""
            decoding="async"
          />
        </div>
      )}
      <div className="beginner-story__shade" aria-hidden="true" />
      {ready ? (
        <section className="beginner-story__copy" aria-label={scene.copy}>
          <p className={done ? undefined : 'is-typing'}>{lines}</p>
        </section>
      ) : (
        <div className="beginner-story__completion-error" role="status">
          {imageError ? (
            <button type="button" onClick={() => setRetry((value) => value + 1)}>
              Повторить загрузку изображения
            </button>
          ) : (
            'Загружаем сюжет…'
          )}
        </div>
      )}
      <button
        className={`beginner-story__cta${done ? ' beginner-story__cta--visible' : ''}`}
        type="button"
        disabled={!done || loading || completing}
        onClick={advance}
      >
        <span>
          {completing
            ? 'Завершаем…'
            : loading
              ? 'Загружаем…'
              : loadError
                ? 'Повторить загрузку'
                : scene.action}
        </span>
        <ArrowRight size={20} aria-hidden="true" />
      </button>
      {loadError && (
        <div className="beginner-story__completion-error" role="alert">
          Не удалось загрузить следующий кадр. Попробуй ещё раз.
        </div>
      )}
      {completionError && (
        <div className="beginner-story__completion-error" role="alert">
          <span>{completionError}</span>
          <button type="button" onClick={onRetry} disabled={completing}>
            Повторить
          </button>
        </div>
      )}
    </main>
  );
}
