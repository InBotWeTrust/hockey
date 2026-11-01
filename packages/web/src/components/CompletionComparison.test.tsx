import React from 'react';
import {render, screen} from '@testing-library/react';
import {CompletionComparison} from './CompletionComparison';
import {describe, expect, it} from 'vitest';
import {completionComparisonCopy, completionComparisonOutcome, completionButtonLabel, type CompletionComparisonData} from './CompletionComparison';
const base:CompletionComparisonData={kind:'daily',currentDate:'2026-11-01',current:{shots:90,goals:60,limit:90},previous:{day:'2026-10-31',shots:90,goals:54,limit:90,comparable:true}};
describe('completion comparison',()=>{
 it('compares complete games in percentage points with yesterday',()=>expect(completionComparisonCopy(base)).toEqual({title:'Прошлая игра · вчера',text:'Точность: 60% → 67% · +7%'}));
 it('uses the day before yesterday',()=>expect(completionComparisonCopy({...base,previous:{...base.previous!,day:'2026-10-30'}})?.title).toBe('Прошлая игра · позавчера'));
 it('uses the previous training for older results',()=>expect(completionComparisonCopy({...base,kind:'training',previous:{...base.previous!,day:'2026-10-25'}})?.title).toBe('Прошлая тренировка · 25 октября'));
 it('celebrates completion after an incomplete session without accuracy comparison',()=>expect(completionComparisonCopy({...base,previous:{...base.previous!,shots:54}})?.text).toBe('В прошлый раз – 54/90 бросков.\nСегодня – все 90!'));
 it('does not compare an unfinished current game',()=>expect(completionComparisonCopy({...base,current:{...base.current,shots:70}})).toBeNull());
 it('marks first games',()=>expect(completionComparisonCopy({...base,previous:null})?.text).toBe('Первая ежедневная игра пройдена!'));
 it('does not compare different conditions',()=>expect(completionComparisonCopy({...base,previous:{...base.previous!,comparable:false}})?.title).toBe('Новые условия'));
 it('handles a decrease neutrally',()=>expect(completionComparisonCopy({...base,previous:{...base.previous!,goals:70}})?.text).toBe('Точность: 78% → 67% · –11%'));
 it('handles equal accuracy',()=>expect(completionComparisonCopy({...base,previous:{...base.previous!,goals:60}})?.text).toBe('Точность на прежнем уровне · 67%'));
});

it('uses green growth and encouraging continuation', () => {
 expect(completionComparisonOutcome(base)).toBe('up');
 expect(completionButtonLabel(base)).toBe('Отлично, завтра продолжу');
});
it('uses red decline and a retry caption', () => {
 const data={...base,previous:{...base.previous!,goals:70}};
 expect(completionComparisonOutcome(data)).toBe('down');
 expect(completionButtonLabel(data)).toBe('Ок, завтра буду лучше');
});

it('colors only the change and keeps accuracy neutral', () => {
 render(<CompletionComparison data={{...base,previous:{...base.previous!,goals:70}}} />);
 const change = screen.getByText('–11%');
 expect(change).toHaveStyle({color: 'var(--danger, #e46d73)'});
 expect(change.parentElement).toHaveStyle({color: 'var(--ink)'});
 expect(change.parentElement?.textContent).toContain('Точность: 78% → 67%');
});

it('uses a baseline instead of guessing unknown historical conditions', () => {
 expect(completionComparisonCopy({...base,previous:{...base.previous!,comparable:false,contextKnown:false}})).toEqual({title:'Результат сохранён',text:'Следующую игру сравним с этой.'});
});
