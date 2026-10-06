import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../auth/authStore.js';
import { useAmateurDuelStore } from '../stores/amateurDuelStore.js';
import type { AmateurDuelMatchState } from '../api/amateurDuel.js';
import { getWebSocketBaseUrl } from '../platform/runtime.js';
export function useDuelFightSocket(matchId: string, enabled: boolean) {
  const token = useAuthStore((s) => s.accessToken);
  const socketRef = useRef<WebSocket | null>(null);
  const sequence = useRef(0);
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
            if (!state || next.fight?.id !== current?.fight?.id || state.phaseId !== current?.fight?.engine_state?.phaseId)
              pending.current.clear();
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
      socket.onclose = () => {
        if (disposed) return;
        setConnected(false);
        timer = setTimeout(connect, 1000);
      };
      socket.onerror = () => {
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
  const sendAction = useCallback(
    (kind: 'attack' | 'block', zone: 'head' | 'body') => {
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
        kind,
        zone,
      });
      pending.current.set(actionId, payload);
      socket.send(payload);
      return true;
    },
    [connected],
  );
  return { connected, error, sendAction, predictionReset };
}
