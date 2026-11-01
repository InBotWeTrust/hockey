import {fireEvent,render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {MapWeeklyChallenge} from './MapWeeklyChallenge.js';
import type {WeeklyChallenge} from '../api/weeklyChallenge.js';
const challenge={hasProgress:true,status:'running',tasks:[{id:'a',title:'Забей шайбы',progress:4,target:10}],canClaimReward:false} as WeeklyChallenge;
it('only shows participating running challenges',()=>{const view=render(<MapWeeklyChallenge challenge={{...challenge,hasProgress:false}} onOpen={()=>{}}/>);expect(screen.queryByText('Забей шайбы')).toBeNull();view.rerender(<MapWeeklyChallenge challenge={challenge} onOpen={()=>{}}/>);expect(screen.getByText('4/10')).toBeVisible();});
it('collapses and opens tasks',()=>{const open=vi.fn();render(<MapWeeklyChallenge challenge={challenge} onOpen={open}/>);fireEvent.click(screen.getByText('Забей шайбы'));expect(open).toHaveBeenCalledTimes(1);fireEvent.click(screen.getByRole('button',{name:/Недельный/}));expect(screen.queryByText('Забей шайбы')).toBeNull();});
