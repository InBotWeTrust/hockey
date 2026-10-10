import { useEffect, useRef, useState } from 'react';
import {
  activePlayer,
  applyAction,
  createGame,
  timeoutAction,
  type Action,
  type Game,
} from './rules.js';
import { attemptCheat, catchCheat } from './cheating.js';
import type { ComputerOpponentId } from './computerOpponents.js';
import { botView, chooseBotAction } from './bot.js';
export interface DurakController {
  game: Game;
  dispatch: (action: Action) => void;
  surrender: () => void;
  restart: (next?: Game) => void;
  remainingSeconds: number | null;
  thinking: boolean;
  challengeCheat?: () => boolean;
}
export function useDurakGame(
  initial?: Game,
  opponentId: ComputerOpponentId = 'maria',
): DurakController {
  const [game, setGame] = useState(() => initial ?? createGame());
  const [generation, setGeneration] = useState(0);
  const [remainingSeconds, setRemaining] = useState<number | null>(null);
  const pendingCheat = useRef<{ before: Game; staged: Game } | null>(null);
  const cheats = useRef(0);
  const skipCheat = useRef(false);
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
    const pace =
      opponentId === 'grigory'
        ? 0.7
        : opponentId === 'arsenich'
          ? 1.4
          : opponentId === 'daria'
            ? 0.9
            : 1;
    const delay = bot
      ? followup
        ? (800 + Math.random() * 400) * pace
        : (2000 + Math.random() * 1000) * pace
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
        if (bot && opponentId === 'grigory') {
          const blocked = skipCheat.current;
          skipCheat.current = false;
          const staged =
            !blocked && cheats.current < 2 && Math.random() < 0.4 ? attemptCheat(game) : null;
          if (staged) {
            cheats.current++;
            pendingCheat.current = { before: game, staged };
            stateRef.current = staged;
            setGame(staged);
            return;
          }
        }
        const action = bot ? chooseBotAction(botView(game, 1), opponentId) : timeoutAction(game, 0);
        if (action)
          setGame((current) => {
            if (current !== game) return current;
            const next = applyAction(current, actor, action);
            if (next !== current) pendingCheat.current = null;
            stateRef.current = next;
            return next;
          });
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
  }, [game, generation, opponentId]);
  const dispatch = (action: Action) => {
    const current = stateRef.current;
    const next = applyAction(current, 0, action);
    if (next !== current) pendingCheat.current = null;
    stateRef.current = next;
    setGame(next);
  };
  const challengeCheat = () => {
    const pending = pendingCheat.current;
    if (!pending || stateRef.current !== pending.staged) return false;
    pendingCheat.current = null;
    skipCheat.current = true;
    const next = catchCheat(pending.before, pending.staged);
    stateRef.current = next;
    setGame(next);
    return true;
  };
  const surrender = () =>
    setGame((current) =>
      current.result !== null
        ? current
        : { ...current, phase: 'ended', result: 1, revision: current.revision + 1 },
    );
  const restart = (next?: Game) => {
    schedule.current = null;
    pendingCheat.current = null;
    cheats.current = 0;
    skipCheat.current = false;
    setGame(next ?? createGame());
    setGeneration((n) => n + 1);
  };
  return {
    game,
    challengeCheat,
    dispatch,
    restart,
    surrender,
    remainingSeconds,
    thinking: game.result === null && activePlayer(game) === 1,
  };
}
