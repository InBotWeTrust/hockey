import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { visitorPhrase } from '@hockey/game-core';
import { formatRussianCount } from '../lib/russianPlural.js';
import { useVisitor } from './visitorApi.js';
import './visitor-card.css';

export function visitorGameResetLabel(resetAt: string, serverNow: string): string {
  const reset = new Date(resetAt),
    now = new Date(serverNow);
  const calendarDay = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((calendarDay(reset) - calendarDay(now)) / 86400000);
  const day =
    days === 0
      ? 'Сегодня'
      : days === 1
        ? 'Завтра'
        : reset.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const time = reset.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${day} в ${time}`;
}
export function VisitorGameGate({
  character,
  children,
  greeting,
  variant = 'launch',
  onBack,
}: {
  character: string;
  children: ReactNode;
  greeting?: ReactNode;
  variant?: 'launch' | 'result';
  onBack?: () => void;
}) {
  const { data } = useVisitor();
  const state = data?.state;
  const remaining = state?.games.byCharacter[character];
  if (remaining === 0 && state)
    return (
      <GameRefusal
        key={character}
        character={character}
        active={state.card.active}
        resetAt={state.resetAt}
        serverNow={state.serverNow}
        cardGames={data.settings.cardGames}
        variant={variant}
        {...(onBack ? { onBack } : {})}
      />
    );
  return (
    <>
      {greeting && (
        <p
          className={`modal-copy${variant === 'launch' ? ' bonus-game-preview-modal__story' : ''}`}
        >
          {greeting}
        </p>
      )}
      {remaining !== undefined && (
        <p className="visitor-quota">
          Игр осталось: {remaining}
          {state?.card.active ? ' с этим персонажем' : ' со всеми персонажами'}.
        </p>
      )}
      {children}
    </>
  );
}
function GameRefusal({
  character,
  active,
  resetAt,
  serverNow,
  cardGames,
  variant,
  onBack,
}: {
  character: string;
  active: boolean;
  resetAt: string;
  serverNow: string;
  cardGames: number;
  variant: 'launch' | 'result';
  onBack?: () => void;
}) {
  const navigate = useNavigate();
  const [phrase] = useState(() =>
    visitorPhrase(
      character,
      'games',
      sessionStorage.getItem(`bar-game-refusal:${character}`) ?? undefined,
      Math.random(),
    ),
  );
  useEffect(() => {
    sessionStorage.setItem(`bar-game-refusal:${character}`, phrase);
  }, [character, phrase]);
  return (
    <>
      <p
        className={`modal-copy visitor-game-farewell${variant === 'launch' ? ' bonus-game-preview-modal__story' : ''}`}
      >
        «{phrase}»
      </p>
      <section className="visitor-game-limit" aria-label="Игры на сегодня завершены">
        <div className="visitor-game-limit__reset" role="status">
          <span>Попытки обновятся</span>
          <strong>{visitorGameResetLabel(resetAt, serverNow)}</strong>
        </div>
        {!active && (
          <p className="visitor-game-limit__benefits">
            Карта даёт {formatRussianCount(cardGames, 'игру', 'игры', 'игр')} в день с каждым
            персонажем.
          </p>
        )}
      </section>
      {(!active || onBack) && (
        <div className="modal-actions visitor-game-actions">
          {!active && (
            <button
              className="modal-primary btn btn--cta"
              onClick={() => navigate('/bar?visitorShop=1')}
            >
              К Игорю за картой
            </button>
          )}
          {onBack && (
            <button
              className={active ? 'modal-primary btn btn--cta' : 'btn btn--ghost'}
              onClick={onBack}
            >
              Вернуться в бар
            </button>
          )}
        </div>
      )}
    </>
  );
}
