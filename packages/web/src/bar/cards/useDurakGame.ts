import { useEffect, useRef, useState } from 'react';
import {
  activePlayer,
  applyAction,
  createGame,
  timeoutAction,
  type Action,
  type Game,
} from './rules.js';
import { botView, chooseBotAction } from './bot.js';
export function useDurakGame(initial?: Game) {
  const [game, setGame] = useState(() => initial ?? createGame());
  const [generation, setGeneration] = useState(0);
  const [remainingSeconds, setRemaining] = useState<number | null>(null);
  const stateRef = useRef(game);
  stateRef.current = game;
  const schedule = useRef<{ game: Game; actor: number; deadline: number } | null>(null);
  useEffect(() => {
    if (game.result !== null) {
      setRemaining(null);
      return;
    }
    const actor = activePlayer(game);
    const bot = actor === 1;
    const previous = schedule.current;
    const followup = bot && previous?.actor === 1;
    const delay = bot
      ? followup
        ? 800 + Math.random() * 400
        : 2000 + Math.random() * 1000
      : 20000;
    const deadline = previous?.game === game ? previous.deadline : Date.now() + delay;
    schedule.current = { game, actor, deadline };
    let fired = false;
    setRemaining(bot ? null : 20);
    const tick = () => {
      if (fired || stateRef.current !== game) return;
      if (!bot) setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
      if (Date.now() >= deadline) {
        fired = true;
        const action = bot ? chooseBotAction(botView(game, 1)) : timeoutAction(game, 0);
        if (action)
          setGame((current) => (current === game ? applyAction(current, actor, action) : current));
      }
    };
    const timeout = window.setTimeout(tick, Math.max(0, deadline - Date.now()));
    const interval = window.setInterval(tick, 100);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [game, generation]);
  const dispatch = (action: Action) => setGame((current) => applyAction(current, 0, action));
  const surrender = () =>
    setGame((current) =>
      current.result !== null
        ? current
        : { ...current, phase: 'ended', result: 1, revision: current.revision + 1 },
    );
  const restart = (next?: Game) => {
    schedule.current = null;
    setGame(next ?? createGame());
    setGeneration((n) => n + 1);
  };
  return {
    game,
    dispatch,
    restart,
    surrender,
    remainingSeconds,
    thinking: game.result === null && activePlayer(game) === 1,
  };
}
