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

it('never reuses an acknowledged sequence after a delayed equal-revision snapshot', () => {
 const hook=renderHook(()=>useDuelFightSocket('match',true)); const socket=Socket.instances[0]!;
 socket.message({type:'duel:snapshot',match:snapshot()}); socket.message({type:'connection:ready'});
 act(()=>hook.result.current.sendAttack()); const first=JSON.parse(socket.sent[0]!);
 socket.message({type:'fight:ack',actionId:first.actionId,ack:{accepted:true,seq:1}});
 socket.message({type:'duel:snapshot',match:snapshot()});
 act(()=>hook.result.current.sendAttack());
 expect(JSON.parse(socket.sent[1]!).seq).toBe(2); hook.unmount();
});
it('stops held renewal and attacks until rejection recovery completes', () => {
 vi.useFakeTimers(); const refresh=vi.spyOn(useAmateurDuelStore.getState(),'refresh').mockImplementation(()=>new Promise(()=>{}));
 const hook=renderHook(()=>useDuelFightSocket('match',true)); const socket=Socket.instances[0]!;
 socket.message({type:'connection:ready'});
 act(()=>hook.result.current.sendInput({direction:1,crouch:false,guard:false}));
 socket.message({type:'fight:error',reason:'sequence'});
 act(()=>vi.advanceTimersByTime(600));
 expect(socket.sent).toHaveLength(1);
 act(()=>expect(hook.result.current.sendAttack()).toBe(false));
 socket.message({type:'duel:snapshot',match:snapshot(2,0,0)});
 act(()=>hook.result.current.sendAttack()); expect(JSON.parse(socket.sent[1]!).seq).toBe(1);
 hook.unmount();refresh.mockRestore();
});

it('applies compact fight updates without rolling back shot progress or match revision',()=>{
 const initial=snapshot(8,0,2); initial.current_period_goals=3;initial.fight!.revision=2;
 useAmateurDuelStore.setState({match:initial});
 const hook=renderHook(()=>useDuelFightSocket('match',true));const socket=Socket.instances[0]!;
 socket.message({type:'connection:ready'});
 const next=snapshot(9,0,3).fight!;next.revision=3;next.engine_state!.hp=[5,4];
 socket.message({type:'fight:snapshot',matchId:'match',fight:next,serverNow:new Date(1000).toISOString()});
 expect(useAmateurDuelStore.getState().match!.fight!.engine_state!.hp).toEqual([5,4]);
 expect(useAmateurDuelStore.getState().match!.current_period_goals).toBe(3);
 expect(useAmateurDuelStore.getState().match!.state_revision).toBe(8);
 const old=snapshot(8,0,2).fight!;old.revision=2;
 socket.message({type:'fight:snapshot',matchId:'match',fight:old,serverNow:new Date(900).toISOString()});
 expect(useAmateurDuelStore.getState().match!.fight!.revision).toBe(3);hook.unmount();
});

it('does not release held movement when a repeated attack is busy', () => {
 vi.useFakeTimers();
 const hook=renderHook(()=>useDuelFightSocket('match',true));
 const socket=Socket.instances[0]!;
 socket.message({type:'connection:ready'});
 act(()=>hook.result.current.sendInput({direction:1,crouch:false,guard:false}));
 let id:unknown;
 act(()=>{id=hook.result.current.sendAttack();});
 const reset=hook.result.current.predictionReset;
 socket.message({type:'fight:ack',actionId:id,ack:{accepted:false,reason:'busy'}});
 expect(hook.result.current.predictionReset).toBe(reset);
 act(()=>vi.advanceTimersByTime(150));
 expect(JSON.parse(socket.sent.at(-1)!).input.direction).toBe(1);
 hook.unmount();
});

it('stops commands and renewals after a terminal snapshot',()=>{
 vi.useFakeTimers();const hook=renderHook(()=>useDuelFightSocket('match',true));const socket=Socket.instances[0]!;
 socket.message({type:'connection:ready'});
 act(()=>hook.result.current.sendInput({direction:1,crouch:false,guard:false}));
 const done=snapshot(2);done.fight!.status='resolved';done.fight!.engine_state!.status='resolved';
 socket.message({type:'duel:snapshot',match:done});const count=socket.sent.length;
 act(()=>vi.advanceTimersByTime(1500));
 act(()=>{expect(hook.result.current.sendAttack()).toBe(false);expect(hook.result.current.sendInput({direction:0,crouch:false,guard:false})).toBe(false);});
 expect(socket.sent).toHaveLength(count);hook.unmount();
});
