import {fireEvent,render,screen} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {MapWeeklyChallenge} from './MapWeeklyChallenge.js';
import type {WeeklyChallenge} from '../api/weeklyChallenge.js';
const challenge={hasProgress:true,status:'running',tasks:[{id:'a',title:'Забей шайбы',progress:4,target:10,completed:false},{id:'b',title:'Сыграй дуэль',progress:1,target:1,completed:true}],canClaimReward:false} as WeeklyChallenge;
beforeEach(()=>localStorage.clear());
it('only shows an icon for running challenges',()=>{
 const view=render(<MapWeeklyChallenge challenge={{...challenge,status:'finished'}} onOpen={()=>{}}/>);
 expect(screen.queryByRole('button',{name:'Челлендж'})).toBeNull();
 view.rerender(<MapWeeklyChallenge challenge={challenge} onOpen={()=>{}}/>);
 expect(screen.getByRole('button',{name:'Челлендж'})).toHaveTextContent('1/2');
 expect(screen.queryByText('Забей шайбы')).toBeNull();
});
it('toggles the window and opens tasks',()=>{
 const open=vi.fn();render(<MapWeeklyChallenge challenge={challenge} onOpen={open}/>);
 fireEvent.click(screen.getByRole('button',{name:'Челлендж'}));
 expect(screen.getByRole('dialog',{name:'Недельный челлендж'})).toBeVisible();
 expect(screen.getByRole('button',{name:'Переместить окно челленджа'})).toBeVisible();
 fireEvent.click(screen.getByText('Забей шайбы'));expect(open).toHaveBeenCalledTimes(1);
 expect(screen.queryByRole('dialog')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Челлендж'}));
 fireEvent.click(screen.getByRole('button',{name:'Закрыть челлендж'}));
 expect(screen.queryByRole('dialog')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Челлендж'}));
 fireEvent.click(screen.getByRole('button',{name:'Челлендж'}));
 expect(screen.queryByRole('dialog')).toBeNull();
});
it('restores the challenge window position independently of games',()=>{
 localStorage.setItem('floating-challenge-window-v1:test-owner',JSON.stringify({x:60,y:80}));
 localStorage.setItem('floating-games-window-v1:test-owner',JSON.stringify({x:200,y:240}));
 const view=render(<MapWeeklyChallenge owner="test-owner" challenge={challenge} onOpen={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Челлендж'}));
 expect(screen.getByRole('dialog')).toHaveStyle({left:'60px',top:'80px'});
 fireEvent.keyDown(screen.getByRole('button',{name:'Переместить окно челленджа'}),{key:'ArrowRight'});
 view.unmount();
 render(<MapWeeklyChallenge owner="test-owner" challenge={challenge} onOpen={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Челлендж'}));
 expect(screen.getByRole('dialog')).toHaveStyle({left:'70px',top:'80px'});
 expect(JSON.parse(localStorage.getItem('floating-games-window-v1:test-owner')!)).toEqual({x:200,y:240});
});
it('hides a claimed challenge and its open window',()=>{
 const view=render(<MapWeeklyChallenge challenge={challenge} onOpen={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Челлендж'}));
 view.rerender(<MapWeeklyChallenge challenge={{...challenge,rewardClaimedAt:'2026-11-06T12:00:00Z'}} onOpen={()=>{}}/>);
 expect(screen.queryByRole('button',{name:'Челлендж'})).toBeNull();
 expect(screen.queryByRole('dialog')).toBeNull();
});
it('shows a new running challenge before participation and opens its tasks',()=>{
 render(<MapWeeklyChallenge challenge={{...challenge,id:'new',hasProgress:false,rewardClaimedAt:null,tasks:challenge.tasks.map(t=>({...t,progress:0,completed:false}))}} onOpen={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Челлендж'}));
 expect(screen.getByText('0/2')).toBeVisible();
 expect(screen.getByText('0/10')).toBeVisible();
});
