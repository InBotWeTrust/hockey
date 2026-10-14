import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ActivityResult } from './ActivityModal.js';
import type { ActivityEvent } from './api.js';

it('displays stored sniper tenths as decimal points without changing goals', () => {
 const event: ActivityEvent = {id:'duel',kind:'duel',occurredAt:'2026-10-14T07:36:31Z',actors:[{id:'a',displayName:'Игрок',avatarUrl:null},{id:'b',displayName:'Соперник',avatarUrl:null}],data:{format:'sniper',winnerId:'a',participants:[{userId:'a',score:673,goals:54,shots:73,durationMs:150000},{userId:'b',score:670,goals:54,shots:66,durationMs:150000}]}};
 render(<ActivityResult event={event} onClose={()=>{}}/>);
 expect(screen.getByText('67,3 : 67,0')).toBeInTheDocument();
 expect(screen.queryByText('Очки')).toBeNull();
 expect(screen.getByRole('heading',{name:'Дуэль'})).toBeInTheDocument();
 expect(screen.getByText('Снайпер')).toBeInTheDocument();
 expect(screen.getByText('67,3 : 67,0')).toHaveClass('activity-duel-result__score');
 expect(screen.getAllByText('54')).toHaveLength(2);
});

it.each(['express','classic','marathon'] as const)('does not rescale %s results', format => {
 const event: ActivityEvent = {id:'duel',kind:'duel',occurredAt:'2026-10-14T07:36:31Z',actors:[{id:'a',displayName:'Игрок',avatarUrl:null},{id:'b',displayName:'Соперник',avatarUrl:null}],data:{format,winnerId:'a',participants:[{userId:'a',score:54,goals:54,shots:73},{userId:'b',score:50,goals:50,shots:66}]}};
 render(<ActivityResult event={event} onClose={()=>{}}/>);
 expect(screen.getByText('54 : 50')).toBeInTheDocument();
 expect(screen.queryByText('Очки')).toBeNull();
});

it('omits routine completion copy and the feed sentence from the duel heading', () => {
 const event: ActivityEvent = {id:'duel',kind:'duel',occurredAt:'2026-10-14T07:36:31Z',actors:[{id:'a',displayName:'Игрок',avatarUrl:null}],data:{format:'express',winnerId:'a',reason:'completed',participants:[{userId:'a',goals:27,shots:30}]}};
 render(<ActivityResult event={event} onClose={()=>{}}/>);
 expect(screen.getByRole('heading',{name:'Дуэль'})).toBeInTheDocument();
 expect(screen.queryByText('Матч завершён')).toBeNull();
 expect(document.querySelector('.daily-result-modal__summary')).toBeNull();
 expect(screen.getByText('Формат')).toBeInTheDocument();
 expect(screen.getByText('Экспресс')).toBeInTheDocument();
 expect(screen.getByRole('table',{name:'Итоговый результат'})).toBeInTheDocument();
});

it('retains the meaningful reason for a technical result', () => {
 const event: ActivityEvent = {id:'duel',kind:'duel',occurredAt:'2026-10-14T07:36:31Z',actors:[{id:'a',displayName:'Игрок',avatarUrl:null}],data:{format:'sniper',winnerId:'a',reason:'opponent_forfeit'}};
 render(<ActivityResult event={event} onClose={()=>{}}/>);
 expect(screen.getByText('Соперник сдался')).toBeInTheDocument();
});
