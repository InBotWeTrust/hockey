import { FightModal } from '../components/duel/fight/FightModal.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FightHeldInput } from '@hockey/game-core';
import { FightView } from '../game/fight/FightView.js';
import {
  fetchOlegFight,
  commandOlegFight,
  acknowledgeOlegFight,
  type OlegSnapshot,
  type OlegCommand,
  type BarAccess,
} from './olegFightApi.js';
import './oleg-fight.css';
export function OlegFightPanel({
  id,
  onDone,
}: {
  id: string;
  onDone: (access: BarAccess) => void;
}) {
  const [data, setData] = useState<OlegSnapshot | null>(null),
    [error, setError] = useState(''),
    [now, setNow] = useState(Date.now()),
    [finishing, setFinishing] = useState(false);
  const current = useRef<OlegSnapshot | null>(null),
    offset = useRef(0),
    busy = useRef<number | null>(null),
    alive = useRef(true),
    generation = useRef(0);
  const queue = useRef<
    Array<
      | { actionId: string; kind: 'attack' }
      | { actionId: string; kind: 'input'; input: FightHeldInput }
    >
  >([]);
  const apply = (next: OlegSnapshot, version: number) => {
    if (
      version !== generation.current ||
      !alive.current ||
      next.id !== id ||
      next.serverNow < (current.current?.serverNow ?? 0)
    )
      return;
    current.current = next;
    offset.current = next.serverNow - Date.now();
    setData(next);
    setError('');
  };
  useEffect(() => {
    const version = ++generation.current;
    alive.current = true;
    current.current = null;
    queue.current = [];
    busy.current = null;
    setData(null);
    let pending = false;
    const read = async () => {
      if (pending) return;
      pending = true;
      try {
        apply(await fetchOlegFight(id), version);
      } catch {
        if (alive.current && version === generation.current)
          setError('Связь прервалась. Восстанавливаем драку…');
      } finally {
        pending = false;
      }
    };
    void read();
    const poll = setInterval(() => void read(), 250),
      clock = setInterval(() => setNow(Date.now() + offset.current), 50);
    return () => {
      alive.current = false;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [id]);
  const drain = async () => {
    const version = generation.current;
    const valid = () => alive.current && version === generation.current;
    if (busy.current !== null || !current.current) return;
    busy.current = version;
    try {
      while (valid() && queue.current.length) {
        const item = queue.current.shift()!;
        const state = current.current;
        if (!state || state.outcome) {
          queue.current = [];
          break;
        }
        const payload: OlegCommand = { ...item, seq: state.nextSeq, phaseId: state.state.phaseId };
        try {
          apply(await commandOlegFight(id, payload), version);
        } catch {
          if (!valid()) break;
          try {
            apply(await commandOlegFight(id, payload), version);
          } catch {
            if (!valid()) break;
            queue.current = [];
            setError('Связь прервалась. Восстанавливаем драку…');
            try {
              apply(await fetchOlegFight(id), version);
            } catch {
              /* Polling resumes authoritative state. */
            }
            break;
          }
        }
      }
    } finally {
      if (busy.current === version) busy.current = null;
    }
  };
  const enqueue = (
    item:
      | { actionId: string; kind: 'attack' }
      | { actionId: string; kind: 'input'; input: FightHeldInput },
  ) => {
    if (!current.current || current.current.outcome || queue.current.length >= 8) return false;
    if (item.kind === 'input')
      queue.current = queue.current.filter((command) => command.kind !== 'input');
    queue.current.push(item);
    void drain();
    return item.actionId;
  };
  if (!data)
    return (
      <FightModal><div className="bar-oleg-status">
        <p role="status">{error || 'Готовим драку…'}</p>
      </div></FightModal>
    );
  const finish = () => {
    if (finishing) return;
    setFinishing(true);
    void acknowledgeOlegFight(id)
      .then(onDone)
      .catch(() => setError('Не удалось закрыть результат. Попробуй ещё раз.'))
      .finally(() => setFinishing(false));
  };
  const resultTitle =
    data.outcome === 'win'
      ? 'Ты победил Олега'
      : data.outcome === 'loss'
        ? 'Олег победил'
        : 'Драка закончилась без победителя';
  if (data.outcome)
    return (
      <AccessibleModal
        title={resultTitle}
        ariaLabel="Результат драки"
        onClose={finish}
        cardClassName="bar-oleg-result"
        headerAction={
          <button
            className="icon-btn"
            aria-label="Закрыть результат"
            disabled={finishing}
            onClick={finish}
          >
            <X size={18} />
          </button>
        }
      >
        {(data.outcome === 'win' || data.outcome === 'loss') && (
          <img
            src={`/bar/fight/${data.outcome === 'win' ? 'player-win' : 'player-loss'}-v2.webp`}
            alt={
              data.outcome === 'win'
                ? 'Олег сидит у стены бара после драки'
                : 'Игрок сидит перед входом в бар после драки'
            }
          />
        )}

        {data.outcome === 'loss' && (
          <p>
            На сегодня бар закрыт для тебя.
            <br />
            <span style={{ whiteSpace: 'nowrap' }}>Приходи после 00:00.</span>
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="modal-actions">
          <button className="btn btn--cta" disabled={finishing} onClick={finish}>
            {data.outcome === 'loss' ? 'Понятно' : 'Вернуться в бар'}
          </button>
        </div>
      </AccessibleModal>
    );
  return (
    <FightModal>
    <div className="bar-oleg-fight">
      <FightView
        state={data.state}
        player={0}
        nowMs={now}
        currentPlayer={{ name: 'Ты', avatarUrl: null }}
        opponent={{ name: 'Олег', avatarUrl: '/bar/cards/oleg-avatar-v2.webp' }}
        skin="bar"
        onAction={() => {}}
        onInput={(input) => enqueue({ actionId: crypto.randomUUID(), kind: 'input', input })}
        onAttack={() => enqueue({ actionId: crypto.randomUUID(), kind: 'attack' })}
      />
      {error && <p role="status">{error}</p>}
    </div>
    </FightModal>
  );
}
