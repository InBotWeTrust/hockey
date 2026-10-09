import { FIGHT_INPUT_RENEW_MS, neutralFightInput, type FightHeldInput } from '@hockey/game-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../auth/authStore.js';
import { useAmateurDuelStore } from '../stores/amateurDuelStore.js';
import type { AmateurDuelMatchState } from '../api/amateurDuel.js';
import { getWebSocketBaseUrl } from '../platform/runtime.js';
type Command =
  | { kind: 'attack' | 'block'; zone: 'head' | 'body' }
  | { kind: 'move'; direction: -1 | 0 | 1 }
  | { kind: 'input'; input: FightHeldInput };
export function useDuelFightSocket(matchId: string, enabled: boolean) {
  const token = useAuthStore((s) => s.accessToken);
  const ready = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const sequence = useRef(0);
  const scope = useRef<string>();
  const recovering = useRef(false);
  const desiredInput = useRef<FightHeldInput>(neutralFightInput());
  const reconnecting = useRef(false);
  const queued = useRef<Array<{ actionId: string; command: Command }>>([]);
  const flush = useRef<() => void>(() => undefined);
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
        ['hockey-fight-v3', `bearer.${token}`],
      );
      socketRef.current = socket;
      ready.current = false;
      socket.onmessage = (event) => {
        if (disposed || socketRef.current !== socket) return;
        try {
          const message = JSON.parse(String(event.data)) as {
            type: string;
            match?: AmateurDuelMatchState;
            matchId?: string;
            fight?: AmateurDuelMatchState['fight'];
            serverNow?: string;
            actionId?: string;
            ack?: { accepted: boolean; seq: number; reason?: string };
            reason?: string;
            fightId?: string;
            seq?: number;
          };
          if (message.type === 'connection:ready') {
            ready.current = true;
            setConnected(true);
            if (recovering.current && pending.current.size === 0) {
              const match = useAmateurDuelStore.getState().match;
              if (match?.id === matchId) {
                sequence.current =
                  match.fight?.engine_state?.lastSeq[match.me.side === 'challenger' ? 0 : 1] ?? 0;
                recovering.current = false;
              }
            }
            setError(null);
            if (
              reconnecting.current &&
              ['fighting', 'sudden_death'].includes(
                useAmateurDuelStore.getState().match?.fight?.status ?? '',
              ) &&
              (useAmateurDuelStore.getState().match?.fight?.engine_state?.rules.version ?? 0) >= 3
            ) {
              reconnecting.current = false;
              queued.current = [
                {
                  actionId: crypto.randomUUID(),
                  command: { kind: 'input', input: neutralFightInput() },
                },
              ];
              flush.current();
            }
            if (
              (useAmateurDuelStore.getState().match?.fight?.engine_state?.rules.version ?? 0) < 3 &&
              ['fighting', 'sudden_death'].includes(
                useAmateurDuelStore.getState().match?.fight?.status ?? '',
              )
            ) {
              for (const payload of pending.current.values()) socket.send(payload);
            } else if (
              !['fighting', 'sudden_death'].includes(
                useAmateurDuelStore.getState().match?.fight?.status ?? '',
              )
            ) {
              pending.current.clear();
              queued.current = [];
              desiredInput.current = neutralFightInput();
            }
            flush.current();
          }
          if (message.type === 'fight:snapshot' && message.matchId === matchId && message.fight) {
            const current = useAmateurDuelStore.getState().match;
            const fight = message.fight;
            if (
              current?.id !== matchId ||
              fight.id !== current.fight?.id ||
              Number(fight.revision ?? 0) < Number(current.fight.revision ?? 0)
            )
              return;
            const player = current.me.side === 'challenger' ? 0 : 1;
            const state = fight.engine_state;
            retireConfirmed(state?.lastSeq[player] ?? 0);
            if (state?.phaseId !== current.fight.engine_state?.phaseId) {
              pending.current.clear();
              queued.current = [];
              desiredInput.current = neutralFightInput();
              recovering.current = true;
            }
            sequence.current = recovering.current
              ? (state?.lastSeq[player] ?? 0)
              : Math.max(sequence.current, state?.lastSeq[player] ?? 0);
            recovering.current = false;
            scope.current = `${fight.id}:${state?.phaseId ?? 'offered'}`;
            useAmateurDuelStore.setState({
              match: {
                ...current,
                fight,
                ...(message.serverNow &&
                Date.parse(message.serverNow) >= Date.parse(current.server_now)
                  ? { server_now: message.serverNow, received_at_performance_ms: performance.now() }
                  : {}),
              },
            });
            setError(null);
            flush.current();
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
            if (
              current?.fight &&
              current.fight.id === next.fight?.id &&
              Number(current?.fight?.revision ?? 0) > Number(next.fight?.revision ?? 0)
            )
              next.fight = current!.fight;
            const state = next.fight?.engine_state;
            const player = next.me.side === 'challenger' ? 0 : 1;
            if (next.fight?.id === current?.fight?.id) retireConfirmed(state?.lastSeq[player] ?? 0);
            if (
              !state ||
              next.fight?.id !== current?.fight?.id ||
              state.phaseId !== current?.fight?.engine_state?.phaseId
            ) {
              pending.current.clear();
              queued.current = [];
              desiredInput.current = neutralFightInput();
              recovering.current = true;
            }
            sequence.current = recovering.current
              ? (state?.lastSeq[player] ?? 0)
              : Math.max(sequence.current, state?.lastSeq[player] ?? 0);
            recovering.current = false;
            scope.current = next.fight
              ? `${next.fight.id}:${state?.phaseId ?? 'offered'}`
              : undefined;
            useAmateurDuelStore.getState().applyState(next);
            setError(null);
            flush.current();
          }
          if (message.type === 'fight:ack' && message.actionId) {
            if (!pending.current.has(message.actionId)) return;
            pending.current.delete(message.actionId);
            sequence.current = Math.max(sequence.current, message.ack?.seq ?? 0);
            if (!message.ack?.accepted && message.ack?.reason !== 'busy') {
              setError('Действие пока недоступно.');
            }
            flush.current();
          }
          if (message.type === 'fight:error') {
            const fight = useAmateurDuelStore.getState().match?.fight;
            if (!fight || !['fighting', 'sudden_death'].includes(fight.status)) return;
            if (message.fightId && message.fightId !== fight.id) return;
            if (message.actionId && !pending.current.has(message.actionId)) return;
            pending.current.clear();
            // The server follows a rejection with an authoritative snapshot. Keep the
            // user's fingers held and renew that intent after resynchronizing sequence.
            queued.current = queued.current.filter((item) => item.command.kind === 'input');
            if (
              desiredInput.current.direction ||
              desiredInput.current.crouch ||
              desiredInput.current.guard
            ) {
              queued.current = [
                {
                  actionId: crypto.randomUUID(),
                  command: { kind: 'input', input: { ...desiredInput.current } },
                },
              ];
            }
            recovering.current = true;
            setError('Восстанавливаем управление боем…');
          }
        } catch {
          setError('Не удалось обновить бой.');
        }
      };
      const resetHeld = () => {
        if ((useAmateurDuelStore.getState().match?.fight?.engine_state?.rules.version ?? 0) >= 3) {
          desiredInput.current = neutralFightInput();
          pending.current.clear();
          queued.current = [];
          reconnecting.current = true;
          recovering.current = true;
          setPredictionReset((n) => n + 1);
        }
      };
      socket.onclose = () => {
        if (disposed || socketRef.current !== socket) return;
        ready.current = false;
        resetHeld();
        setConnected(false);
        timer = setTimeout(connect, 1000);
      };
      socket.onerror = () => {
        if (disposed || socketRef.current !== socket) return;
        ready.current = false;
        resetHeld();
        setConnected(false);
      };
    };
    sequence.current = 0;
    scope.current = undefined;
    recovering.current = true;
    pending.current.clear();
    queued.current = [];
    connect();
    return () => {
      disposed = true;
      ready.current = false;
      if (timer) clearTimeout(timer);
      setConnected(false);
      socketRef.current?.close();
      socketRef.current = null;
      pending.current.clear();
      queued.current = [];
    };
  }, [matchId, enabled, token]);
  const retireConfirmed = (lastSeq: number) => {
    for (const [id, payload] of pending.current) {
      if (JSON.parse(payload).seq <= lastSeq) pending.current.delete(id);
    }
  };
  const synchronizeScope = () => {
    const match = useAmateurDuelStore.getState().match;
    const fight = match?.fight;
    const identity = fight ? `${fight.id}:${fight.engine_state?.phaseId ?? 'offered'}` : undefined;
    if (scope.current !== identity) {
      scope.current = identity;
      pending.current.clear();
      queued.current = [];
      desiredInput.current = neutralFightInput();
      sequence.current = fight?.engine_state?.lastSeq[match?.me.side === 'challenger' ? 0 : 1] ?? 0;
      recovering.current = false;
    }
  };
  const canSend = () => {
    const socket = socketRef.current;
    const fight = useAmateurDuelStore.getState().match?.fight;
    return (
      ready.current &&
      !recovering.current &&
      socket?.readyState === WebSocket.OPEN &&
      !!fight?.engine_state &&
      ['fighting', 'sudden_death'].includes(fight.status) &&
      ['fighting', 'sudden_death'].includes(fight.engine_state.status)
    );
  };
  flush.current = () => {
    if (!canSend() || pending.current.size || !queued.current.length) return;
    const item = queued.current.shift()!;
    const fight = useAmateurDuelStore.getState().match!.fight!;
    const payload = JSON.stringify({
      type: 'fight:action',
      fightId: fight.id,
      phaseId: fight.engine_state!.phaseId,
      seq: ++sequence.current,
      actionId: item.actionId,
      ...item.command,
    });
    pending.current.set(item.actionId, payload);
    socketRef.current!.send(payload);
  };
  const sendCommand = useCallback((command: Command) => {
    synchronizeScope();
    const fight = useAmateurDuelStore.getState().match?.fight;
    if (
      !canSend() &&
      !(
        ready.current &&
        command.kind === 'input' &&
        recovering.current &&
        socketRef.current?.readyState === WebSocket.OPEN &&
        fight &&
        ['fighting', 'sudden_death'].includes(fight.status)
      )
    )
      return false;
    // One outstanding transaction: coalesce input changes and keep at most one
    // buffered attack. Sequence numbers are assigned only when actually sent.
    if (command.kind === 'input') {
      const outstanding = [...pending.current.values()][0];
      if (
        outstanding &&
        JSON.stringify(JSON.parse(outstanding).input) === JSON.stringify(command.input) &&
        !queued.current.some((i) => i.command.kind === 'input')
      ) {
        return JSON.parse(outstanding).actionId as string;
      }
      // Preserve the stance preceding a buffered attack; only coalesce inputs
      // after that attack so a later release cannot turn a low strike into a high one.
      let lastAction = -1;
      for (let index = 0; index < queued.current.length; index++) {
        if (queued.current[index]!.command.kind !== 'input') lastAction = index;
      }
      queued.current = queued.current.filter((item, index) =>
        index <= lastAction || item.command.kind !== 'input',
      );
    } else if (queued.current.some((i) => i.command.kind === command.kind)) return false;
    const actionId = crypto.randomUUID();
    queued.current.push({ actionId, command });
    flush.current();
    return actionId;
  }, []);
  const sendAction = useCallback(
    (kind: 'attack' | 'block', zone: 'head' | 'body') => Boolean(sendCommand({ kind, zone })),
    [sendCommand],
  );
  const sendMove = useCallback(
    (direction: -1 | 0 | 1) => Boolean(sendCommand({ kind: 'move', direction })),
    [sendCommand],
  );
  const sendInput = useCallback(
    (input: FightHeldInput) => {
      const accepted = sendCommand({ kind: 'input', input });
      desiredInput.current = accepted ? { ...input } : neutralFightInput();
      return accepted;
    },
    [sendCommand],
  );
  const sendAttack = useCallback(
    () => sendCommand({ kind: 'attack', zone: 'head' }),
    [sendCommand],
  );
  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(() => {
      const input = desiredInput.current;
      if (input.direction || input.crouch || input.guard) sendInput(input);
    }, FIGHT_INPUT_RENEW_MS);
    const release = () => sendInput(neutralFightInput());
    const hidden = () => {
      if (document.hidden) release();
    };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      clearInterval(timer);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', hidden);
      desiredInput.current = neutralFightInput();
    };
  }, [connected, sendInput]);
  return { connected, error, sendAction, sendMove, sendInput, sendAttack, predictionReset };
}
