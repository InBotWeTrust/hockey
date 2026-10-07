import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FightModal } from './src/components/duel/fight/FightModal';
import { FightResultModal } from './src/components/duel/fight/FightResultModal';
import { FightView } from './src/game/fight/FightView';
import {
  advanceFight,
  createFightState,
  DEFAULT_FIGHT_RULES,
  type FightCommand,
} from '@hockey/game-core';
import './src/app/global.css';
import './src/app/design-system.css';
function Scene() {
  const [now, setNow] = useState(Date.now());
  const [mode, setMode] = useState('idle');
  const [player, setPlayer] = useState<0 | 1>(0);
  const fight = useRef(createFightState(DEFAULT_FIGHT_RULES, now + 1000));
  const botAt = useRef(now + 2000);
  const send = (
    command:
      | Omit<
          Extract<FightCommand, { kind: 'move' }>,
          'player' | 'phaseId' | 'seq' | 'effectiveAtMs'
        >
      | Omit<
          Extract<FightCommand, { kind: 'attack' | 'block' }>,
          'player' | 'phaseId' | 'seq' | 'effectiveAtMs'
        >,
    side = player,
  ) => {
    const time = Date.now();
    const input = {
      ...command,
      player: side,
      phaseId: fight.current.phaseId,
      seq: fight.current.lastSeq[side] + 1,
      effectiveAtMs: time,
    } as FightCommand;
    const next = advanceFight(
      fight.current,
      [input],
      Math.max(fight.current.finalizedThroughMs, time),
    );
    fight.current = next.state;
    setNow(time);
    return !next.events.some((e) => e.type === 'rejected');
  };
  useEffect(() => {
    const timer = setInterval(() => {
      const time = Date.now();
      if (
        mode !== 'idle' &&
        time >= botAt.current &&
        time >= fight.current.phaseStartedAtMs &&
        ['fighting', 'sudden_death'].includes(fight.current.status)
      ) {
        const side = player === 0 ? 1 : 0;
        send(
          {
            kind: mode.startsWith('block') ? 'block' : 'attack',
            zone: mode.endsWith('body') ? 'body' : 'head',
          },
          side,
        );
        botAt.current = time + 1800;
      }
      fight.current = advanceFight(
        fight.current,
        [],
        Math.max(fight.current.finalizedThroughMs, time),
      ).state;
      setNow(time);
    }, 16);
    return () => clearInterval(timer);
  }, [mode, player]);
  const restart = () => {
    const time = Date.now();
    const next = createFightState(DEFAULT_FIGHT_RULES, time + 1000);
    fight.current = next;
    botAt.current = time + 2000;
    setNow(time);
    setReset((n) => n + 1);
  };
  const [reset, setReset] = useState(0);
  return (
    <div className="duel-fight-screen">
      <FightModal>
        <FightView
          key={reset}
          currentPlayer={{ name: 'Ты', avatarUrl: '/sprites/advanced-training-coach-avatar.webp' }}
          opponent={{ name: 'Соперник', avatarUrl: null }}
          state={fight.current}
          player={player}
          nowMs={now}
          onAction={(kind, zone) => send({ kind, zone })}
          onMove={(direction) => send({ kind: 'move', direction })}
        />
        {fight.current.status === 'resolved' && now < (fight.current.endedAtMs ?? now) + 2700 && (
          <FightResultModal won={fight.current.winner === player} />
        )}
        <div
          style={{
            paddingTop: 8,
            flex: '0 0 auto',
            display: 'flex',
            gap: 6,
            justifyContent: 'center',
            fontSize: 11,
          }}
        >
          <button onClick={restart}>Новый бой</button>
          <button
            onClick={() => {
              restart();
              fight.current.hp[player === 0 ? 1 : 0] = 1;
              setMode('idle');
            }}
          >
            Последний удар
          </button>
          <select
            aria-label="Действие соперника"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              botAt.current = Date.now() + 500;
            }}
          >
            <option value="idle">Соперник ждёт</option>
            <option value="attack_head">Бьёт в голову</option>
            <option value="attack_body">Бьёт в корпус</option>
            <option value="block_head">Блок головы</option>
            <option value="block_body">Блок корпуса</option>
          </select>
          <button
            onClick={() => {
              setPlayer((p) => (p === 0 ? 1 : 0));
              restart();
            }}
          >
            Сменить сторону
          </button>
        </div>
      </FightModal>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Scene />);
