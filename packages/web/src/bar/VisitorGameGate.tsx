import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { visitorPhrase } from '@hockey/game-core';
import { useVisitor, visitorTime } from './visitorApi.js';
import './visitor-card.css';
export function VisitorGameGate({
  character,
  avatar,
  children,
}: {
  character: string;
  avatar?: string;
  children: ReactNode;
}) {
  const { data } = useVisitor();
  const state = data?.state;
  const remaining = state?.games.byCharacter[character];
  return (
    <>
      {remaining !== undefined && (
        <p className="visitor-quota">
          Игр осталось: {remaining}
          {state?.card.active ? ' с этим персонажем' : ' со всеми персонажами'}.
        </p>
      )}
      {remaining === 0 && state ? (
        <GameRefusal
          character={character}
          {...(avatar ? { avatar } : {})}
          active={state.card.active}
          resetAt={state.resetAt}
        />
      ) : (
        children
      )}
    </>
  );
}
function GameRefusal({
  character,
  avatar,
  active,
  resetAt,
}: {
  character: string;
  avatar?: string;
  active: boolean;
  resetAt: string;
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
    <div className="visitor-refusal glass" role="status">
      {avatar && <img src={avatar} alt="Персонаж" />}
      <p>{phrase}</p>
      <p>Новые игры будут доступны {visitorTime(resetAt)}.</p>
      {!active && (
        <>
          <p>Карта посетителя открывает ежедневные игры с каждым персонажем.</p>
          <button className="btn btn--cta" onClick={() => navigate('/bar?visitorShop=1')}>
            К Игорю
          </button>
        </>
      )}
    </div>
  );
}
