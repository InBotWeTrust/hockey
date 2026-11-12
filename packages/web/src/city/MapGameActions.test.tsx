import {render,screen,within} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {MapGameActions} from './MapGameActions';
import type {ArenaEntry} from './GameHub';
const entry=(id:string,kind:'daily'|'training',mapLabel:string,mapTimer:string):ArenaEntry=>({id,kind,eyebrow:id,title:id,subtitle:'',meta:'',ctaLabel:'',onEnter:vi.fn(),mapLabel,mapTimer});
it('keeps progress and separately labelled timers under their respective map icons',()=>{
 render(<MapGameActions entries={[entry('daily','daily','30/90','Перерыв 14:59'),entry('training','training','40/100','До обновления\n11:43:35')]} onOpen={vi.fn()} now={0}/>);
 expect(screen.getByText('30/90')).toBeVisible();
 expect(screen.getByText('40/100')).toBeVisible();
 expect(within(screen.getByRole('button',{name:'Ежедневная'})).getByRole('timer')).toHaveTextContent('14:59');
 const timer=within(screen.getByRole('button',{name:'Тренировка'})).getByRole('timer');
 expect(timer).toHaveTextContent('11:43:35');
 expect(timer.parentElement).toHaveClass('map-action-note','map-action-summary');
 expect(timer.textContent).toBe('11:43:35');
 expect(timer.parentElement?.textContent).not.toContain('40/100');
 expect(screen.getByText('40/100').parentElement).toHaveClass('map-action-art');
 expect(screen.getByText('30/90').parentElement).toHaveClass('map-action-art');
 expect(timer.parentElement?.textContent).not.toContain('До обновления');
});
it('keeps only a completion check for completed activities',()=>{
 render(<MapGameActions entries={[{...entry('daily','daily','90/90','До обновления 11:43:35'),dockState:'done'}]} onOpen={vi.fn()} now={0}/>);
 expect(screen.queryByRole('timer')).toBeNull();
 expect(screen.queryByText('90/90')).toBeNull();
 expect(screen.getByRole('button',{name:'Ежедневная – завершено'})).toBeVisible();
});
it.each(['duel', 'bar'] as const)('keeps one pending %s invitation visible in the red event counter', kind => {
 const invite: ArenaEntry = { id: 'invite', kind, eyebrow: kind === 'bar' ? 'Бильярд' : 'Дуэль', title: 'Opponent', subtitle: '', meta: '', ctaLabel: '', dockState: 'ready', attention: true, mapExpiresAt: 60000, onEnter: vi.fn() };
 render(<MapGameActions entries={[invite]} onOpen={vi.fn()} now={1000} />);
 const button = screen.getByRole('button', { name: /событий: 1/ });
 expect(within(button).getByText('1')).toBeVisible();
});
