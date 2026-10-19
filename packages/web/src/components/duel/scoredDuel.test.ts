import { describe, expect, it } from 'vitest';
import { rhythmGoalDetails, duelDisplayScore, duelFormatLabel } from './scoredDuel.js';
describe('scored duel presentation', () => {
  it('keeps raw goals separate from format points and penalties', () => {
    expect(duelDisplayScore('sniper', { goals: 3, format_score: 5.2 })).toBe(5.2);
    expect(duelDisplayScore('marathon', { goals: 9, format_score: 2 })).toBe(2);
    expect(duelDisplayScore('rhythm', { goals: 9, format_score: 2 })).toBe(2);
    expect(duelDisplayScore('classic', { goals: 3, format_score: 5 })).toBe(3);
  });
  it('makes the invited Marathon variant visible', () => {
    expect(duelFormatLabel({ duelKind: 'marathon', marathonWindowMs: 4000 })).toBe(
      'Марафон · 4 сек',
    );
    expect(duelFormatLabel({ duelKind: 'sniper' })).toBe('Снайпер');
    expect(duelFormatLabel({duelKind:'rhythm'})).toBe('Ритм');
  });
});

it('labels a new Rhythm series before showing its confirmed length', () => {
  expect(rhythmGoalDetails([{travel:5,goal:true}], 2)).toEqual(['Серия началась']);
  expect(rhythmGoalDetails([{travel:5,goal:true},{travel:7,goal:true}], 2)).toEqual(['Серия 2']);
  expect(rhythmGoalDetails([{travel:5,goal:true},{travel:7.01,goal:true}], 2)).toEqual(['Серия началась']);
  expect(rhythmGoalDetails([{travel:5,goal:true},{travel:6,goal:true},{travel:9,goal:true}], 2)).toEqual(['Серия началась']);
});

it('starts a new duel series after six goals followed by a non-goal in version three',()=>{
 const goals=Array.from({length:6},(_,i)=>({travel:i*.2,goal:true}));
 expect(rhythmGoalDetails([...goals,{travel:1.2,goal:false},{travel:1.4,goal:true}],3)).toEqual(['Серия началась']);
});
