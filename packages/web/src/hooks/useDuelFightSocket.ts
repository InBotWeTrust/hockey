import { FIGHT_INPUT_RENEW_MS, neutralFightInput, type FightHeldInput } from '@hockey/game-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../auth/authStore.js';
import { useAmateurDuelStore } from '../stores/amateurDuelStore.js';
import type { AmateurDuelMatchState } from '../api/amateurDuel.js';
import { getWebSocketBaseUrl } from '../platform/runtime.js';
export function useDuelFightSocket(matchId: string, enabled: boolean) {
  const token = useAuthStore((s) => s.accessToken);
  const socketRef = useRef<WebSocket | null>(null);
  const sequence = useRef(0);
  const desiredInput = useRef<FightHeldInput>(neutralFightInput());
  const reconnecting = useRef(false);
  const pending = useRef(new Map<string, string>());
  const [predictionReset, setPredictionReset] = useState(0);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !token) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      if (disposed) return;
      const socket = new WebSocket(
        `${getWebSocketBaseUrl()}/api/duel/amateur/matches/${matchId}/ws`,
        ['hockey-fight-v1', `bearer.${token}`],
      );
      socketRef.current = socket;
      socket.onmessage = (event) => {
        if (disposed) return;
        try {
          const message = JSON.parse(String(event.data)) as {
            type: string;
            match?: AmateurDuelMatchState;
            actionId?: string;
            ack?: { accepted: boolean; seq: number };
          };
          if (message.type === 'connection:ready') {
            setConnected(true);
            setError(null);
            if (reconnecting.current && (useAmateurDuelStore.getState().match?.fight?.engine_state?.rules.version ?? 0) >= 3) {
              reconnecting.current=false;
              const fight=useAmateurDuelStore.getState().match!.fight!;
              socket.send(JSON.stringify({type:'fight:action',fightId:fight.id,phaseId:fight.engine_state!.phaseId,seq:++sequence.current,actionId:crypto.randomUUID(),kind:'input',input:neutralFightInput()}));
            }
            for (const payload of pending.current.values()) socket.send(payload);
          }
          if (message.type === 'duel:snapshot' && message.match) {
            const next = { ...message.match, received_at_performance_ms: performance.now() };
            if (next.id !== matchId) return;
            const current = useAmateurDuelStore.getState().match;
            if (
              current?.id === next.id &&
              (current.state_revision ?? 0) > (next.state_revision ?? 0)
            )
              return;
            const state = next.fight?.engine_state;
            const player = next.me.side === 'challenger' ? 0 : 1;
            if (
              !state ||
              next.fight?.id !== current?.fight?.id ||
              state.phaseId !== current?.fight?.engine_state?.phaseId
            )
              { pending.current.clear(); desiredInput.current=neutralFightInput(); }
            sequence.current =
              pending.current.size === 0
                ? (state?.lastSeq[player] ?? 0)
                : Math.max(sequence.current, state?.lastSeq[player] ?? 0);
            useAmateurDuelStore.getState().applyState(next);
          }
          if (message.type === 'fight:ack' && message.actionId) {
            pending.current.delete(message.actionId);
            if (!message.ack?.accepted) {
              setPredictionReset((n) => n + 1);
              setError('Действие пока недоступно.');
            }
          }
          if (message.type === 'fight:error') {
            pending.current.clear();
            setPredictionReset((n) => n + 1);
            setError('Действие не принято. Дождись обновления боя.');
            void useAmateurDuelStore.getState().refresh();
          }
        } catch {
          setError('Не удалось обновить бой.');
        }
      };
      const resetHeld = () => {
        if ((useAmateurDuelStore.getState().match?.fight?.engine_state?.rules.version ?? 0) >= 3) {
          desiredInput.current=neutralFightInput();pending.current.clear();reconnecting.current=true;
          setPredictionReset(n=>n+1);
        }
      };
      socket.onclose = () => {
        if (disposed) return;
        resetHeld();
        setConnected(false);
        timer = setTimeout(connect, 1000);
      };
      socket.onerror = () => {
        resetHeld();
        setConnected(false);
      };
    };
    sequence.current = 0;
    pending.current.clear();
    connect();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      setConnected(false);
      socketRef.current?.close();
      socketRef.current = null;
      pending.current.clear();
    };
  }, [matchId, enabled, token]);
  const sendCommand = useCallback(
    (
      command:
        | { kind: 'attack' | 'block'; zone: 'head' | 'body' }
        | { kind: 'move'; direction: -1 | 0 | 1 }
        | { kind: 'input'; input: FightHeldInput },
    ) => {
      const socket = socketRef.current;
      const fight = useAmateurDuelStore.getState().match?.fight;
      if (!connected || socket?.readyState !== WebSocket.OPEN || !fight?.engine_state) return false;
      const actionId = crypto.randomUUID();
      const payload = JSON.stringify({
        type: 'fight:action',
        fightId: fight.id,
        actionId,
        phaseId: fight.engine_state.phaseId,
        seq: ++sequence.current,
        ...command,
      });
      pending.current.set(actionId, payload);
      socket.send(payload);
      return actionId;
    },
    [connected],
  );
  const sendAction = useCallback(
    (kind: 'attack' | 'block', zone: 'head' | 'body') => Boolean(sendCommand({ kind, zone })),
    [sendCommand],
  );
  const sendMove = useCallback(
    (direction: -1 | 0 | 1) => Boolean(sendCommand({ kind: 'move', direction })),
    [sendCommand],
  );
  const sendInput = useCallback((input: FightHeldInput) => {
    const accepted=sendCommand({kind:'input',input});
    desiredInput.current=accepted ? {...input} : neutralFightInput();
    return Boolean(accepted);
  },[sendCommand]);
  const sendAttack = useCallback(()=>sendCommand({kind:'attack',zone:'head'}),[sendCommand]);
  useEffect(()=>{
    if(!connected) return;
    const timer=setInterval(()=>{
      const input=desiredInput.current;
      if(input.direction||input.crouch||input.guard) sendInput(input);
    },FIGHT_INPUT_RENEW_MS);
    const release=()=>sendInput(neutralFightInput());
    const hidden=()=>{if(document.hidden)release();};
    window.addEventListener('blur',release);document.addEventListener('visibilitychange',hidden);
    return ()=>{clearInterval(timer);window.removeEventListener('blur',release);document.removeEventListener('visibilitychange',hidden);desiredInput.current=neutralFightInput();};
  },[connected,sendInput]);
  return { connected, error, sendAction, sendMove, sendInput, sendAttack, predictionReset };
}
