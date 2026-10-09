import { useRef, useState, type CSSProperties } from 'react';
import type { AmateurDuelMatchState } from '../../../api/amateurDuel.js';
import { challengeAmateurFight, respondAmateurFight } from '../../../api/amateurDuel.js';
import { useAmateurDuelStore } from '../../../stores/amateurDuelStore.js';
import '../../../game/fight/fight.css';

export function FightControls({
  match,
  nowMs,
  iconStyle,
}: {
  match: AmateurDuelMatchState;
  nowMs: number;
  iconStyle?: CSSProperties;
}): JSX.Element | null {
  const lock = useRef(false);
  const request = useRef<{ id: string; operation: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (operation: 'challenge' | 'accept' | 'decline') => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    if (request.current?.operation !== operation)
      request.current = { id: crypto.randomUUID(), operation };
    try {
      const result =
        operation === 'challenge'
          ? await challengeAmateurFight(match.id, request.current.id)
          : await respondAmateurFight(match.id, match.fight!.id, operation, request.current.id);
      useAmateurDuelStore.getState().applyState(result.match);
      request.current = null;
    } catch {
      setError('Не удалось выполнить действие. Обновляем дуэль.');
      await useAmateurDuelStore.getState().refresh();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const fight = match.fight;
  if (!match.fight_enabled && fight?.status !== 'offered') return null;
  const offered = fight?.status === 'offered';
  const incoming = offered && fight.initiator_user_id !== match.me.user_id;
  const remaining = offered
    ? Math.max(0, Math.ceil((Date.parse(fight.response_deadline_at) - nowMs) / 1000))
    : 0;
  if (!offered && !match.fight_availability?.allowed) return null;
  const disabled = busy || (offered && (!incoming || remaining === 0));
  const forced = offered && fight.forced === true;
  const calls = match.fight_availability?.remainingCalls;
  const label = offered
    ? incoming ? forced ? 'Принять драку сейчас. Драка начнётся автоматически' : 'Принять драку' : forced ? 'Драка начнётся автоматически' : 'Ждём ответа соперника'
    : 'Вызвать на драку';
  return (
    <div
      style={{ pointerEvents: 'auto', position: 'relative', width: 31, height: 31, flexShrink: 0 }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {offered && (
        <span className="fight-challenge__timer" role="timer" aria-label={forced ? 'Время до обязательной драки' : 'Время на ответ'}>
          {remaining}
        </span>
      )}
      <button
        type="button"
        className="fight-challenge icon-btn"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={() => void act(incoming ? 'accept' : 'challenge')}
        style={{
          position: 'absolute',
          left: -8.5,
          top: -8.5,
          width: 48,
          height: 48,
          border: 0,
          padding: 8.5,
          background: 'transparent',
          boxShadow: 'none',
          cursor: disabled ? 'default' : 'pointer',
          color: 'var(--ink)',
        }}
      >
        <span
          className={incoming && remaining > 0 ? 'fight-challenge__pulse' : undefined}
          style={{
            background: 'rgba(255,255,255,.24)',
            border: '1px solid rgba(255,255,255,.82)',
            ...iconStyle,
            width: 31,
            height: 31,
            borderRadius: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <img
            src="/sprites/fight/fist-bare-icon-v3.webp"
            alt=""
            width={27}
            height={27}
            draggable={false}
            style={{ objectFit: 'contain' }}
          />
        </span>
      </button>
      {!incoming && calls !== undefined && (
        <span className="fight-challenge__count" aria-label={`Осталось вызовов: ${calls}`}>
          {calls}
        </span>
      )}
      <span className="fight-challenge__label" aria-hidden="true">
        {forced ? 'БОЙ' : offered ? incoming ? 'ПРИНЯТЬ' : 'ЖДЁМ' : 'ВЫЗВАТЬ'}
      </span>
      {error && <p className="fight-challenge__error" role="status">{error}</p>}
    </div>
  );
}
