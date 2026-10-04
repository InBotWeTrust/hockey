import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import {
  arsenichIntroductionQueryKey,
  completeArsenichDestinationIntroduction,
  fetchArsenichDestinationIntroduction,
  type ArsenichDestinationKey,
} from '../api/arsenich.js';

const TITLE_TYPING_DELAY_MS = 34;
const DETAILS_ACTION_DELAY_MS = 500;

function TypedSpokenTitle({
  title,
  onTypingDoneChange,
}: {
  title: string;
  onTypingDoneChange: (done: boolean) => void;
}): JSX.Element {
  const fullText = `«${title}»`;
  const reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [typedLength, setTypedLength] = useState(reduceMotion ? fullText.length : 0);

  useEffect(() => {
    onTypingDoneChange(false);
    if (reduceMotion) {
      setTypedLength(fullText.length);
      onTypingDoneChange(true);
      return undefined;
    }
    setTypedLength(0);
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setTypedLength(index);
      if (index >= fullText.length) {
        window.clearInterval(timer);
        onTypingDoneChange(true);
      }
    }, TITLE_TYPING_DELAY_MS);
    return () => window.clearInterval(timer);
  }, [fullText, onTypingDoneChange, reduceMotion]);

  let characterIndex = 0;
  return (
    <strong
      aria-label={fullText}
      data-typing-done={typedLength >= fullText.length ? 'true' : 'false'}
    >
      <span aria-hidden="true">
        {fullText.split(/(\s+)/).map((word, wordIndex) => {
          const start = characterIndex;
          characterIndex += word.length;
          return (
            <span
              key={`${word}-${wordIndex}`}
              className={/\S/.test(word) ? 'arsenich-introduction__word' : undefined}
            >
              {word.split('').map((character, offset) => (
                <span
                  key={`${character}-${offset}`}
                  style={{ visibility: start + offset < typedLength ? 'visible' : 'hidden' }}
                >
                  {character}
                </span>
              ))}
            </span>
          );
        })}
      </span>
    </strong>
  );
}

function IntroductionBody({ body }: { body: string }): JSX.Element {
  const blocks: JSX.Element[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];
  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ');
    blocks.push(<p key={`paragraph-${blocks.length}`}>{text}</p>);
    paragraph = [];
  };
  const flushBullets = (): void => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul className="arsenich-introduction__hints" key={`hints-${blocks.length}`}>
        {bullets.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  body.split('\n').forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushBullets();
    } else if (line.startsWith('- ')) {
      flushParagraph();
      bullets.push(line.slice(2).trim());
    } else {
      flushBullets();
      paragraph.push(line);
    }
  });
  flushParagraph();
  flushBullets();

  return <div className="arsenich-introduction__description">{blocks}</div>;
}

export function DestinationIntroductionPrompt({
  title,
  body,
  ctaLabel,
  pending = false,
  error = false,
  onAdvance,
}: {
  title: string;
  body: string;
  ctaLabel: string;
  pending?: boolean;
  error?: boolean;
  onAdvance: () => void;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [titleTypingDone, setTitleTypingDone] = useState(false);
  const [detailsActionVisible, setDetailsActionVisible] = useState(false);

  useEffect(() => {
    if (!titleTypingDone) {
      setDetailsActionVisible(false);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setDetailsActionVisible(true);
    }, DETAILS_ACTION_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [titleTypingDone]);
  return createPortal(
    <div className="arsenich-introduction-shell">
      <div className="arsenich-introduction__blocker" aria-hidden="true" />
      <aside
        className={`arsenich-introduction glass-dark${expanded ? ' arsenich-introduction--expanded' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-live="polite"
      >
        <div className="arsenich-introduction__header">
          <img
            className="arsenich-introduction__avatar"
            src="/arsenich/dovolny-arsenich.png"
            alt=""
          />
          <div className="arsenich-introduction__copy">
            <TypedSpokenTitle title={title} onTypingDoneChange={setTitleTypingDone} />
          </div>
        </div>
        {expanded ? (
          <>
            <IntroductionBody body={body} />
            {error && (
              <p role="alert" className="form-error">
                Не удалось сохранить просмотр. Проверь соединение и повтори.
              </p>
            )}
            <div className="arsenich-introduction__actions">
              <button
                type="button"
                className="btn btn--cta"
                disabled={pending}
                onClick={onAdvance}
              >
                {error ? 'Повторить' : ctaLabel}
              </button>
            </div>
          </>
        ) : detailsActionVisible ? (
          <div className="arsenich-introduction__actions">
            <button type="button" className="btn btn--cta" onClick={() => setExpanded(true)}>
              Узнать подробнее
            </button>
          </div>
        ) : null}
      </aside>
    </div>,
    document.body,
  );
}

export function DestinationIntroduction({
  destination,
}: {
  destination: ArsenichDestinationKey;
}): JSX.Element | null {
  const queryClient = useQueryClient();
  const [windowIndex, setWindowIndex] = useState(0);
  const [dismissedRevision, setDismissedRevision] = useState<number | null>(null);
  const queryKey = arsenichIntroductionQueryKey(destination);
  const query = useQuery({
    queryKey,
    queryFn: () => fetchArsenichDestinationIntroduction(destination),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const intro = query.data?.intro ?? null;
  const completion = useMutation({
    mutationFn: (revision: number) =>
      completeArsenichDestinationIntroduction(destination, revision),
    onSuccess: (_result, revision) => {
      setDismissedRevision(revision);
      queryClient.setQueryData(queryKey, { intro: null });
    },
  });

  useEffect(() => {
    setWindowIndex(0);
    completion.reset();
  }, [destination, intro?.revision]);
  if (!intro || dismissedRevision === intro.revision) return null;
  const currentWindow = intro.windows[windowIndex];
  if (!currentWindow) return null;
  const isLast = windowIndex === intro.windows.length - 1;
  const advance = (): void => {
    if (!isLast) setWindowIndex((current) => current + 1);
    else completion.mutate(intro.revision);
  };

  return (
    <DestinationIntroductionPrompt
      title={currentWindow.title}
      body={currentWindow.body}
      ctaLabel={currentWindow.ctaLabel}
      pending={completion.isPending}
      error={completion.isError}
      onAdvance={completion.isError ? () => completion.mutate(intro.revision) : advance}
    />
  );
}
