import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Assets, type Application } from 'pixi.js';
import { Fighter, FIGHT_ASSETS, type FighterPose } from './Fighter.js';
import {
  FIGHT_HIT_REACTION_MS,
  fightPositionsAt,
  fightInRange,
  type FightState,
  type FightZone,
  type FightMoveCommand,
} from '@hockey/game-core';
import { PixiStage } from '../PixiStage.js';
import './fight.css';
import { fightDefeatPose } from './fightDefeatPose.js';
import { fightVisualPose } from './fightVisualPose.js';
import { fightEntranceX } from './fightEntrance.js';
import { FightFeedbackTracker, FIGHT_FEEDBACK_MS } from './fightFeedback.js';
import { UserAvatar } from '../../chat/components/UserAvatar.js';
export interface FightViewProps {
  predictionReset?: number;
  currentPlayer?: { name: string; avatarUrl: string | null };
  opponent?: { name: string; avatarUrl: string | null };
  state: FightState;
  player: 0 | 1;
  nowMs: number;
  onMove?: (direction: -1 | 0 | 1) => void | boolean;
  onAction: (kind: 'attack' | 'block', zone: FightZone) => void | boolean;
}
export function FightView({
  state,
  player,
  nowMs,
  onAction,
  onMove,
  predictionReset,
  currentPlayer,
  opponent,
}: FightViewProps): JSX.Element {
  const [predictedUntil, setPredictedUntil] = useState(0);
  const predictedRef = useRef(0);
  const appRef = useRef<Application | null>(null);
  const sprites = useRef<Fighter[]>([]);
  const prediction = useRef<{
    kind: 'attack' | 'block';
    zone: FightZone;
    startedAtMs: number;
  } | null>(null);
  const [moving, setMoving] = useState<-1 | 0 | 1>(0);
  const movingRef = useRef<-1 | 0 | 1>(0);
  const movePredictions = useRef<FightMoveCommand[]>([]);
  const nowRef = useRef(nowMs);
  nowRef.current = nowMs;
  const moveCallback = useRef(onMove);
  moveCallback.current = onMove;
  const move = (direction: -1 | 0 | 1) => {
    if (
      direction !== 0 &&
      (terminal || nowMs < state.phaseStartedAtMs || nowMs >= state.deadlineMs)
    )
      return;
    if (moveCallback.current?.(direction) === false) return;
    movingRef.current = direction;
    setMoving(direction);
    movePredictions.current.push({
      kind: 'move',
      player,
      direction,
      phaseId: state.phaseId,
      seq: 1,
      effectiveAtMs: nowRef.current,
    });
  };
  useEffect(() => {
    const stop = () => {
      if (movingRef.current) {
        moveCallback.current?.(0);
        movingRef.current = 0;
        setMoving(0);
        movePredictions.current = [];
      }
    };
    const hidden = () => {
      if (document.hidden) stop();
    };
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      stop();
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  useEffect(() => {
    if (!moving) return;
    const timer = setInterval(() => {
      if (moveCallback.current?.(movingRef.current) === false) {
        movingRef.current = 0;
        setMoving(0);
        return;
      }
      movePredictions.current.push({
        kind: 'move',
        player,
        direction: movingRef.current,
        phaseId: state.phaseId,
        seq: 1,
        effectiveAtMs: nowRef.current,
      });
    }, 200);
    return () => clearInterval(timer);
  }, [moving, player, state.phaseId]);
  const [textureFailed, setTextureFailed] = useState(false);
  const feedbackTracker = useRef(new FightFeedbackTracker(state));
  const feedback = feedbackTracker.current.advance(state, nowMs);
  const feedbackNodes = useRef(new Map<string, HTMLDivElement>());
  const previousHp = useRef(state.hp);
  const hitUntil = useRef<[number, number]>([0, 0]);
  useEffect(
    () => () => {
      appRef.current = null;
      sprites.current = [];
    },
    [],
  );
  useEffect(() => {
    predictedRef.current = 0;
    setPredictedUntil(0);
    prediction.current = null;
    if (movingRef.current) moveCallback.current?.(0);
    movingRef.current = 0;
    setMoving(0);
    movePredictions.current = [];
  }, [state.phaseId, predictionReset]);
  const other = player === 0 ? 1 : 0;
  for (const i of [0, 1] as const)
    if (state.hp[i] < previousHp.current[i]) hitUntil.current[i] = nowMs + FIGHT_HIT_REACTION_MS;
  previousHp.current = state.hp;
  const terminal = state.status === 'resolved' || state.status === 'cancelled';
  const ownAction = [...state.actions]
    .reverse()
    .find((a) => a.player === player && nowMs < a.busyUntilMs + state.rules.deliveryGraceMs);
  const lockEnd = Math.max(
    predictedUntil,
    ownAction ? ownAction.busyUntilMs + state.rules.deliveryGraceMs : 0,
  );
  const lockStart = ownAction?.effectiveAtMs ?? prediction.current?.startedAtMs ?? nowMs;
  const readiness = Math.max(
    0,
    Math.min(1, (nowMs - lockStart) / Math.max(1, lockEnd - lockStart)),
  );
  const activeKind =
    ownAction?.kind ?? (nowMs < predictedUntil ? prediction.current?.kind : undefined);
  const activeZone = ownAction?.zone ?? prediction.current?.zone;
  const predictionAcknowledged =
    prediction.current &&
    state.actions.some(
      (a) =>
        a.player === player &&
        a.kind === prediction.current!.kind &&
        a.zone === prediction.current!.zone &&
        a.effectiveAtMs >= prediction.current!.startedAtMs - state.rules.deliveryGraceMs,
    );
  const visualState = {
    ...state,
    actions:
      prediction.current && !predictionAcknowledged && nowMs < predictedUntil
        ? [
            ...state.actions,
            {
              player,
              phaseId: state.phaseId,
              seq: -1,
              ...prediction.current,
              effectiveAtMs: prediction.current.startedAtMs,
              activeAtMs:
                prediction.current.startedAtMs +
                (prediction.current.kind === 'attack' ? state.rules.windupMs : 0),
              activeUntilMs:
                prediction.current.startedAtMs +
                (prediction.current.kind === 'attack'
                  ? state.rules.windupMs + state.rules.activeMs
                  : state.rules.blockMs),
              busyUntilMs: predictedUntil,
              resolved: false,
            },
          ]
        : state.actions,
    moves: [
      ...(state.moves ?? []),
      ...movePredictions.current.filter(
        (m) =>
          m.effectiveAtMs >
          Math.max(
            ...(state.moves ?? []).filter((a) => a.player === player).map((a) => a.effectiveAtMs),
            -1,
          ),
      ),
    ],
  };
  const positions = fightPositionsAt(visualState, nowMs);
  const inRange = fightInRange(visualState, nowMs);
  useEffect(() => {
    if (terminal || nowMs >= state.deadlineMs) {
      if (movingRef.current) moveCallback.current?.(0);
      movingRef.current = 0;
      setMoving(0);
      movePredictions.current = [];
    }
  }, [terminal, state.deadlineMs, nowMs]);
  const busy =
    terminal || nowMs < state.phaseStartedAtMs || nowMs >= state.deadlineMs || nowMs < lockEnd;
  const layout = () => {
    const app = appRef.current;
    if (!app) return;
    const host = app.canvas.parentElement;
    if (
      host &&
      host.clientWidth > 0 &&
      host.clientHeight > 0 &&
      (app.screen.width !== host.clientWidth || app.screen.height !== host.clientHeight)
    ) {
      app.renderer.resize(host.clientWidth, host.clientHeight);
    }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const fighterScale = Math.min((app.screen.width - 16) / 580, (app.screen.height * 0.84) / 512);
    const baseline = Math.min(
      app.screen.height * 0.9,
      app.screen.height * 0.6 + 405 * fighterScale * 0.5,
    );
    sprites.current.forEach((fighter, i) => {
      const index = i === 0 ? player : other;
      const action = [...state.actions]
        .reverse()
        .find((a) => a.player === index && nowMs < a.busyUntilMs && nowMs >= a.effectiveAtMs);
      let pose: FighterPose =
        fightDefeatPose(
          state.hp[index],
          state.status === 'resolved' && state.winner !== index,
          nowMs,
          hitUntil.current[index],
        ) ?? (action ? fightVisualPose(action, nowMs) : 'idle');
      if (
        !terminal &&
        index === player &&
        prediction.current &&
        nowMs < predictedUntil &&
        !action &&
        !predictionAcknowledged
      )
        pose =
          prediction.current.kind === 'block'
            ? `block_${prediction.current.zone}`
            : `windup_${prediction.current.zone}`;
      fighter.view.position.set(
        fightEntranceX(
          app.screen.width,
          i as 0 | 1,
          state.phaseId,
          state.phaseStartedAtMs,
          nowMs,
          reduced,
          fighterScale,
          app.screen.width * (player === 0 ? positions[index]! : 1 - positions[index]!),
        ),
        baseline,
      );
      const reaction = [...feedback]
        .reverse()
        .find((e) => e.attacker === index || e.defender === index);
      if (reaction && pose !== 'lose') {
        if (reaction.defender === index && !reaction.blocked) pose = 'hit';
      }
      const pendingAttack = action?.kind === 'attack' && !action.resolved;
      const predictedAttack =
        index === player &&
        prediction.current?.kind === 'attack' &&
        nowMs < predictedUntil &&
        !predictionAcknowledged &&
        !action;
      const preparing = !reaction && (pendingAttack || predictedAttack);
      const preparationStart = pendingAttack
        ? action.effectiveAtMs
        : (prediction.current?.startedAtMs ?? nowMs);
      fighter.update(
        pose,
        fighterScale * 384,
        fighterScale * 512,
        reduced,
        reaction
          ? {
              kind:
                reaction.defender === index
                  ? reaction.blocked
                    ? 'guard'
                    : 'hit'
                  : reaction.blocked
                    ? 'blocked'
                    : 'strike',
              progress: (nowMs - reaction.startedAtMs) / FIGHT_FEEDBACK_MS,
            }
          : undefined,
        preparing
          ? Math.max(0, Math.min(1, (nowMs - preparationStart) / state.rules.windupMs))
          : undefined,
        pose === 'lose' && hitUntil.current[index] > 0
          ? Math.max(0, Math.min(1, (nowMs - hitUntil.current[index]) / 350))
          : undefined,
      );
      if (reduced || state.phaseId !== 0 || nowMs >= state.phaseStartedAtMs) {
        // A fixed skate footprint avoids shifts when the arm pose changes.
        const margin = 130 * fighterScale + 12;
        fighter.view.x = Math.max(margin, Math.min(app.screen.width - margin, fighter.view.x));
      }
      const points = fighter.targets;
      for (const event of feedback) {
        const role = event.defender === index ? 'defender' : 'attacker';
        const node = feedbackNodes.current.get(`${event.id}:${role}`);
        if (!node) continue;
        const point = role === 'attacker' ? fighter.contact : points[event.zone];
        node.style.left = `${fighter.view.x + point.x}px`;
        node.style.top = `${fighter.view.y + point.y}px`;
      }
    });
  };
  useEffect(() => {
    layout();
  });
  const act = (kind: 'attack' | 'block', zone: FightZone) => {
    if (busy || nowMs < predictedRef.current) return;
    if (onAction(kind, zone) === false) return;
    prediction.current = { kind, zone, startedAtMs: nowMs };
    predictedRef.current =
      nowMs +
      (kind === 'attack'
        ? state.rules.windupMs + state.rules.activeMs + state.rules.attackRecoveryMs
        : state.rules.blockMs + state.rules.blockRecoveryMs);
    predictedRef.current += state.rules.deliveryGraceMs;
    setPredictedUntil(predictedRef.current);
  };
  return (
    <section aria-label="Драка" className="fight-scene">
      <div className="fight-stage">
        <div className="fight-scoreboard game-scoreboard game-scoreboard--stable-surface">
          <div className="fight-scoreboard__row game-scoreboard__row">
            {([player, other] as const).map((index, side) => (
              <div
                key={index}
                className={`fight-health fight-health--${side} game-scoreboard__metric`}
                aria-label={`${side === 0 ? 'Ты' : 'Соперник'}: ${state.hp[index]} HP`}
              >
                <UserAvatar
                  avatarUrl={(side === 0 ? currentPlayer : opponent)?.avatarUrl}
                  name={
                    (side === 0 ? currentPlayer : opponent)?.name ?? (side === 0 ? 'Ты' : 'Соперник')
                  }
                  size={32}
                  alt={side === 0 ? 'Аватар текущего игрока' : 'Аватар соперника'}
                />
                <span
                  className="fight-health__name game-scoreboard__label"
                  title={(side === 0 ? currentPlayer : opponent)?.name}
                >
                  {(side === 0 ? currentPlayer : opponent)?.name ?? (side === 0 ? 'Ты' : 'Соперник')}
                </span>
                <div className="fight-health__pips" aria-hidden="true">
                  {Array.from({ length: state.rules.initialHp }, (_, i) => i).map((pip) => (
                    <i key={pip} className={pip < state.hp[index] ? 'is-filled' : ''} />
                  ))}
                </div>
              </div>
            ))}
            <div
              className="fight-timer game-scoreboard__metric game-scoreboard__metric--timer"
              role="timer"
            >
              <span className="game-scoreboard__label">Время</span>
              <strong className="game-scoreboard__value">
                {Math.max(
                  0,
                  Math.ceil(
                    ((nowMs < state.phaseStartedAtMs ? state.phaseStartedAtMs : state.deadlineMs) -
                      nowMs) /
                      1000,
                  ),
                )}
              </strong>
              {(nowMs < state.phaseStartedAtMs || state.status === 'sudden_death') && (
                <small>{nowMs < state.phaseStartedAtMs ? 'Старт' : 'Решающий удар'}</small>
              )}
            </div>
          </div>
        </div>
        {textureFailed && (
          <p className="fight-notice" role="status">
            Игроки не загрузились. Зоны удара и блока доступны.
          </p>
        )}
        <div className="fight-arena">
          <PixiStage
            onResize={layout}
            onReady={(app) => {
              appRef.current = app;
              void Assets.load([...FIGHT_ASSETS])
                .then(() => {
                  if (appRef.current !== app) return;
                  sprites.current = ([0, 1] as const).map((side) => {
                    const fighter = new Fighter(side);
                    app.stage.addChild(fighter.view);
                    return fighter;
                  });
                  layout();
                })
                .catch(() => {
                  if (appRef.current === app) setTextureFailed(true);
                });
            }}
          />
          <div className="fight-feedback-layer" aria-hidden="true">
            {feedback.flatMap((event) =>
              (['attacker', 'defender'] as const).map((role) => {
                const kind =
                  role === 'defender'
                    ? event.blocked
                      ? 'guard'
                      : 'hit'
                    : event.blocked
                      ? 'blocked'
                      : 'strike';
                const key = `${event.id}:${role}`;
                return (
                  <div
                    key={key}
                    ref={(node) => {
                      if (node) feedbackNodes.current.set(key, node);
                      else feedbackNodes.current.delete(key);
                    }}
                    className={`fight-feedback fight-feedback--${kind}`}
                    data-feedback={kind}
                  >
                    <span />
                    {[0, 1, 2, 3].map((n) => (
                      <i key={n} style={{ '--spark-angle': `${n * 90 + 45}deg` } as CSSProperties} />
                    ))}
                  </div>
                );
              }),
            )}
          </div>
        </div>
      </div>
      <div className="fight-actions" aria-label="Действия в драке">
        {(['head', 'body'] as const).flatMap((zone) =>
          (['block', 'attack'] as const).map((kind) => {
            const label =
              kind === 'attack'
                ? zone === 'head'
                  ? 'Ударить в голову'
                  : 'Ударить в корпус'
                : zone === 'head'
                  ? 'Блок головы'
                  : 'Блок корпуса';
            return (
              <button
                key={`${kind}-${zone}`}
                type="button"
                className={`btn btn--cta fight-action${kind === 'attack' && inRange ? ' is-in-range' : ''}${busy && activeKind === kind && activeZone === zone ? ' is-active' : ''}`}
                style={{ '--fight-ready': `${readiness * 100}%` } as CSSProperties}
                aria-pressed={busy && activeKind === kind && activeZone === zone}
                disabled={busy}
                aria-label={label}
                onClick={() => act(kind, zone)}
              >
                <span>
                  {kind === 'attack'
                    ? zone === 'head'
                      ? 'Удар в голову'
                      : 'Удар в корпус'
                    : label}
                </span>
                {busy && !terminal && <i className="fight-action__progress" aria-hidden="true" />}
              </button>
            );
          }),
        )}
      </div>
      {onMove && state.rules.version >= 2 && (
        <div className="fight-movement" aria-label="Движение в драке">
          {([-1, 1] as const).map((direction) => (
            <button
              key={direction}
              type="button"
              className="btn btn--cta fight-move"
              aria-label={direction === 1 ? 'Двигаться вперёд' : 'Двигаться назад'}
              aria-pressed={moving === direction}
              disabled={terminal || nowMs < state.phaseStartedAtMs || nowMs >= state.deadlineMs}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture?.(e.pointerId);
                move(direction);
              }}
              onPointerUp={() => move(0)}
              onPointerCancel={() => move(0)}
              onLostPointerCapture={() => {
                if (movingRef.current === direction) move(0);
              }}
              onKeyDown={(e) => {
                if (!e.repeat && (e.key === ' ' || e.key === 'Enter')) {
                  e.preventDefault();
                  move(direction);
                }
              }}
              onKeyUp={(e) => {
                if (e.key === ' ' || e.key === 'Enter') move(0);
              }}
              onBlur={() => {
                if (movingRef.current === direction) move(0);
              }}
            >
              <span aria-hidden="true">{direction === 1 ? '→' : '←'}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
