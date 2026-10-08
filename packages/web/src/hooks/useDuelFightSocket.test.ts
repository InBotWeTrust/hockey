import type * as Runtime from '../platform/runtime.js';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFightState, DEFAULT_FIGHT_RULES } from '@hockey/game-core';
import { useAuthStore } from '../auth/authStore.js';
import { useAmateurDuelStore } from '../stores/amateurDuelStore.js';
import type { AmateurDuelMatchState } from '../api/amateurDuel.js';
import { useDuelFightSocket } from './useDuelFightSocket.js';
vi.mock('../platform/runtime.js', async (importOriginal) => ({
  ...(await importOriginal<typeof Runtime>()),
  getWebSocketBaseUrl: () => 'ws://localhost',
}));
class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  constructor() {
    Socket.instances.push(this);
  }
  send(payload: string) {
    this.sent.push(payload);
  }
  close() {
    this.onclose?.();
  }
  message(payload: unknown) {
    act(() => this.onmessage?.({ data: JSON.stringify(payload) }));
  }
}
function snapshot(revision = 1, phaseId = 0, lastSeq = 0) {
  const engine = createFightState(DEFAULT_FIGHT_RULES, 0);
  engine.phaseId = phaseId;
  engine.lastSeq = [lastSeq, 0];
  return {
    id: 'match',
    state_revision: revision,
    me: { side: 'challenger' },
    fight: { id: 'fight', status: 'fighting', engine_state: engine },
  } as unknown as AmateurDuelMatchState;
}
beforeEach(() => {
  Socket.instances = [];
  vi.stubGlobal('WebSocket', Socket);
  useAuthStore.setState({ accessToken: 'synthetic-test-token' });
  useAmateurDuelStore.setState({ match: snapshot() });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  useAmateurDuelStore.setState({ match: null });
});
describe('fight socket recovery', () => {
  it('replays the same pending action after reconnect', () => {
    vi.useFakeTimers();
    const legacy=snapshot(); legacy.fight!.engine_state!.rules.version=2;useAmateurDuelStore.setState({match:legacy});
    const hook = renderHook(() => useDuelFightSocket('match', true));
    const first = Socket.instances[0]!;
    first.message({ type: 'duel:snapshot', match: legacy });
    first.message({ type: 'connection:ready' });
    act(() => {
      expect(hook.result.current.sendAction('attack', 'head')).toBe(true);
    });
    const payload = first.sent[0];
    act(() => first.close());
    act(() => vi.advanceTimersByTime(1000));
    const second = Socket.instances[1]!;
    second.message({ type: 'duel:snapshot', match: legacy });
    second.message({ type: 'connection:ready' });
    expect(second.sent).toEqual([payload]);
    hook.unmount();
  });
  it('drops old phase pending input and continues from authoritative sequence', () => {
    const hook = renderHook(() => useDuelFightSocket('match', true));
    const socket = Socket.instances[0]!;
    socket.message({ type: 'connection:ready' });
    act(() => hook.result.current.sendAction('attack', 'head'));
    socket.message({ type: 'duel:snapshot', match: snapshot(2, 1, 0) });
    act(() => hook.result.current.sendAction('block', 'body'));
    expect(JSON.parse(socket.sent[1]!).seq).toBe(1);
    expect(JSON.parse(socket.sent[1]!).phaseId).toBe(1);
    hook.unmount();
  });
});

it('starts a new sequence and drops pending inputs for the second fight', () => {
 const hook=renderHook(()=>useDuelFightSocket('match',true));
 const socket=Socket.instances[0]!;
 socket.message({type:'connection:ready'});
 act(()=>hook.result.current.sendAction('attack','head'));
 const next=snapshot(2); next.fight!.id='second';
 socket.message({type:'duel:snapshot',match:next});
 act(()=>hook.result.current.sendAction('block','head'));
 expect(JSON.parse(socket.sent[1]!).seq).toBe(1);
 expect(JSON.parse(socket.sent[1]!).fightId).toBe('second');
 hook.unmount();
});
it('v3 renews held input and reconnects neutral without replaying attacks',()=>{
 vi.useFakeTimers();const hook=renderHook(()=>useDuelFightSocket('match',true));const first=Socket.instances[0]!;
 first.message({type:'duel:snapshot',match:snapshot()});first.message({type:'connection:ready'});
 act(()=>hook.result.current.sendInput({direction:0,crouch:true,guard:true}));
 act(()=>vi.advanceTimersByTime(300));expect(first.sent.filter(p=>JSON.parse(p).kind==='input')).toHaveLength(3);
 act(()=>hook.result.current.sendAttack());act(()=>first.close());act(()=>vi.advanceTimersByTime(1000));
 const second=Socket.instances[1]!;second.message({type:'duel:snapshot',match:snapshot(2,0,4)});second.message({type:'connection:ready'});
 expect(second.sent.map(p=>JSON.parse(p).kind)).toEqual(['input']);expect(JSON.parse(second.sent[0]!).input).toEqual({direction:0,crouch:false,guard:false});
 hook.unmount(); const count=second.sent.length;act(()=>vi.advanceTimersByTime(1000));expect(second.sent).toHaveLength(count);
});
