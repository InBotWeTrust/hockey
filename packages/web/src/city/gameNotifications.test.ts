import {expect,it} from 'vitest';
import {gameNotifications,prioritizeGameEntries} from './gameNotifications.js';
import type {ArenaEntry} from '../screens/DailyScreen.js';
const entry=(id:string,kind:ArenaEntry['kind'],dockState:NonNullable<ArenaEntry['dockState']>):ArenaEntry=>({id,kind,dockState,eyebrow:id,title:id,subtitle:'',meta:'',ctaLabel:'На лёд',onEnter:()=>{}});
it('counts unfinished daily and training neutrally, including a temporary lock',()=>{
 expect(gameNotifications([entry('d','daily','ready'),entry('t','training','blocked')])).toEqual({count:2,urgent:false,firstIndex:0});
});
it('counts pending duels and tournaments red, even while waiting for an opponent',()=>{
 expect(gameNotifications([entry('d','daily','ready'),entry('duel','duel','blocked'),entry('cup','classic','break')])).toEqual({count:3,urgent:true,firstIndex:1});
});
it('removes completed games and ignores missing data instead of guessing availability',()=>{
 expect(gameNotifications([entry('d','daily','done'),entry('t','training','done'),entry('cup','classic','done')])).toEqual({count:0,urgent:false,firstIndex:null});
 expect(gameNotifications([]).count).toBe(0);
});
it('puts unfinished tournaments and duels before daily games and completed events',()=>{
 const daily=entry('daily','daily','ready');
 const done=entry('old-cup','classic','done');
 const cup={...entry('cup','classic','active'),deadlineAt:100};
 const duel={...entry('duel','duel','ready'),deadlineAt:200};
 const ordered=prioritizeGameEntries([daily,done,duel,cup,entry('training','training','ready')]);
 expect(ordered.map(e=>e.id)).toEqual(['cup','duel','daily','old-cup','training']);
 expect(gameNotifications(ordered).firstIndex).toBe(0);
});
