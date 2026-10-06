import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Assets, type Application } from 'pixi.js';
import { Fighter, FIGHT_ASSETS, type FighterPose } from './Fighter.js';
import type { FightState, FightZone } from '@hockey/game-core';
import { PixiStage } from '../PixiStage.js';
import './fight.css';
import { FIGHT_ART } from './fightArt.js';
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
  onAction: (kind: 'attack' | 'block', zone: FightZone) => void | boolean;
}
export function FightView({
  state,
  player,
  nowMs,
  onAction,
  predictionReset,
  currentPlayer,
  opponent,
}: FightViewProps): JSX.Element {
  const [predictedUntil, setPredictedUntil] = useState(0);
  const predictedRef = useRef(0);
  const appRef = useRef<Application | null>(null);
  const sprites = useRef<Fighter[]>([]);
  const prediction = useRef<{ kind: 'attack' | 'block'; zone: FightZone } | null>(null);
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
  }, [state.phaseId, state.lastSeq[player], predictionReset]);
  const other = player === 0 ? 1 : 0;
  for (const i of [0, 1] as const)
    if (state.hp[i] < previousHp.current[i]) hitUntil.current[i] = nowMs + 350;
  previousHp.current = state.hp;
  const terminal = state.status === 'resolved' || state.status === 'cancelled';
  const busy =
    terminal ||
    nowMs < state.phaseStartedAtMs ||
    nowMs >= state.deadlineMs ||
    nowMs < predictedUntil ||
    state.actions.some((a) => a.player === player && nowMs < a.busyUntilMs);
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
    const fighterScale = Math.min((app.screen.width - 16) / 520, (app.screen.height * 0.84) / 512);
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
        state.hp[index] === 0 || (state.status === 'resolved' && state.winner !== index)
          ? 'lose'
          : nowMs < hitUntil.current[index]
            ? 'hit'
            : action
              ? fightVisualPose(action, nowMs)
              : 'idle';
      if (!terminal && index === player && prediction.current?.kind === 'block' && nowMs < predictedUntil)
        pose = `${prediction.current.kind}_${prediction.current.zone}`;
      fighter.view.position.set(
        fightEntranceX(
          app.screen.width,
          i as 0 | 1,
          state.phaseId,
          state.phaseStartedAtMs,
          nowMs,
          reduced,
          fighterScale,
        ),
        baseline,
      );
      const reaction = [...feedback]
        .reverse()
        .find((e) => e.attacker === index || e.defender === index);
      if (reaction && state.hp[index] > 0) {
        if (reaction.defender === index && !reaction.blocked) pose = 'hit';
        else if (reaction.attacker === index && nowMs - reaction.startedAtMs < 260)
          pose = `attack_${reaction.zone}`;
      }
      const pendingAttack = action?.kind === 'attack' && !action.resolved;
      const predictedAttack =
        index === player &&
        prediction.current?.kind === 'attack' &&
        nowMs < predictedUntil &&
        !action;
      const preparing = !reaction && (pendingAttack || predictedAttack);
      const preparationStart = pendingAttack
        ? action.effectiveAtMs
        : predictedUntil -
          (state.rules.windupMs + state.rules.activeMs + state.rules.attackRecoveryMs);
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
          ? Math.max(
              0,
              Math.min(
                1,
                (nowMs - preparationStart) /
                  (state.rules.windupMs + state.rules.activeMs + state.rules.deliveryGraceMs),
              ),
            )
          : undefined,
      );
      if (reduced || state.phaseId !== 0 || nowMs >= state.phaseStartedAtMs) {
        const frame = FIGHT_ART.frames[pose];
        const left = (frame.offsetX - 192) * fighterScale;
        const right = (frame.offsetX + frame.width - 192) * fighterScale;
        const outerLeft = i === 0 ? left : -right;
        const outerRight = i === 0 ? right : -left;
        fighter.view.x = Math.max(
          -outerLeft + 12,
          Math.min(app.screen.width - outerRight - 12, fighter.view.x),
        );
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
    prediction.current = { kind, zone };
    predictedRef.current =
      nowMs +
      (kind === 'attack'
        ? state.rules.windupMs + state.rules.activeMs + state.rules.attackRecoveryMs
        : state.rules.blockMs + state.rules.blockRecoveryMs);
    setPredictedUntil(predictedRef.current);
  };
  return (
    <section aria-label="Драка" className="fight-scene">
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
                {[0, 1, 2].map((pip) => (
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
                className="btn btn--cta fight-action"
                disabled={busy}
                aria-label={label}
                onClick={() => act(kind, zone)}
              >
                {kind === 'attack' ? (zone === 'head' ? 'Удар в голову' : 'Удар в корпус') : label}
              </button>
            );
          }),
        )}
      </div>
    </section>
  );
}
