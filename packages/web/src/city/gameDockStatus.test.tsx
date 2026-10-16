import {expect,it} from 'vitest';
import {gameDockStatus} from './gameDockStatus.js';
import type {ArenaEntry} from '../screens/DailyScreen.js';
const base:ArenaEntry={id:'daily',kind:'daily',eyebrow:'Игра',title:'Игра',subtitle:'',meta:'',ctaLabel:'На лёд',onEnter:()=>{}};
function Timer(_props:{timer:string}){return null;}
it('hides the label when daily and training are done without active games',()=>{
 expect(gameDockStatus([{...base,dockState:'done'},{...base,id:'training',kind:'training',dockState:'done'}])).toEqual({label:null,urgent:false});
});
it('keeps playing available when only training remains',()=>{
 expect(gameDockStatus([{...base,dockState:'done'},{...base,id:'training',kind:'training',dockState:'ready'}]).label).toBe('Играть');
});
it('shows the shortest deadline active game timer ahead of available daily play',()=>{
 expect(gameDockStatus([{...base,dockState:'ready'},{...base,id:'duel',kind:'duel',dockState:'active',attention:true,deadlineAt:200,scoreboard:<Timer timer="05:00"/>},{...base,id:'other',dockState:'break',deadlineAt:100,scoreboard:<Timer timer="02:00"/>}])).toEqual({label:'02:00',urgent:true});
});
it('does not show the day reset countdown or invent a ready game while loading',()=>{
 expect(gameDockStatus([{...base,dockState:'done',scoreboard:<Timer timer="11:43:35"/>}]).label).toBeNull();expect(gameDockStatus([]).label).toBeNull();
});
