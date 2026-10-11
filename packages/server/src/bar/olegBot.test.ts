import { expect, it } from 'vitest';
import { advanceOlegRuntime, createOlegRuntime } from './olegBot.js';
it('makes server-controlled decisions and restores the same fight after a restart', () => {
  const initial = createOlegRuntime(1000, 123);
  const a = advanceOlegRuntime(initial, 6000);
  expect(a.state.responsive?.commands.some((c) => c.player === 1)).toBe(true);
  const restored = JSON.parse(JSON.stringify(a));
  expect(advanceOlegRuntime(restored, 21000)).toEqual(advanceOlegRuntime(a, 21000));
  expect(initial.state.hp).toEqual([5, 10]);
});
it('different seeds produce different decisions, including pauses and posture changes', () => {
  const a = advanceOlegRuntime(createOlegRuntime(1000, 1), 6000);
  const b = advanceOlegRuntime(createOlegRuntime(1000, 2), 6000);
  expect(a.state.responsive?.commands).not.toEqual(b.state.responsive?.commands);
});
it('never rerolls a completed fight', () => {
  const ended = advanceOlegRuntime(createOlegRuntime(1000, 321), 40000);
  expect(['resolved', 'cancelled']).toContain(ended.state.status);
  expect(advanceOlegRuntime(ended, 50000)).toEqual(ended);
});
it('does not inspect or react to future player commands',()=>{
 const initial=createOlegRuntime(1000,42);
 const future={player:0 as const,phaseId:0,seq:1,effectiveAtMs:15000,kind:'input' as const,input:{direction:-1 as const,crouch:true,guard:true}};
 expect(advanceOlegRuntime(initial,6000,[future])).toEqual(advanceOlegRuntime(initial,6000));
});
