import {expect,it,vi} from 'vitest';
import type {BarGameLobby,BarGameSnapshot} from '@hockey/game-core';
import {barMenuEntries} from './barMenuEntries.js';
import type {RoomView} from './cards/roomApi.js';
const cards={roomId:'table',matchId:null,searching:false,invites:[]};
it('keeps a waiting table reachable without issuing a leave command',()=>{
 const open=vi.fn();const rows=barMenuEntries('me',cards,null,{status:'waiting',pending:['other']} as RoomView,undefined,open);
 expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({kind:'bar',inProgress:false,title:'Карточный стол'});
 rows[0]!.onEnter();expect(open).toHaveBeenCalledWith('/bar/cards/room/table');
 expect(barMenuEntries('me',cards,null,{status:'ended'} as RoomView,undefined,open)).toEqual([]);
});
it.each(['darts','billiards','battleship','armwrestling','checkers','ochko'] as const)('returns to an existing %s match',kind=>{
 const open=vi.fn();const lobby={matchId:'match',invites:[]} as unknown as BarGameLobby;
 const match={kind,ready:null,runtime:{game:{winner:null}}} as BarGameSnapshot;
 const rows=barMenuEntries('me',null,lobby,undefined,match,open);
 expect(rows[0]).toMatchObject({kind:'bar',inProgress:true});rows[0]!.onEnter();expect(open).toHaveBeenCalledWith('/bar/games/match/match');
 match.runtime.game.winner=0;expect(barMenuEntries('me',null,lobby,undefined,match,open)).toEqual([]);
});
it('does not pulse before readiness, or show another user outgoing invite',()=>{
 const lobby={matchId:null,invites:[{id:'invite',senderId:'me',receiverName:'Other',status:'pending',kind:'darts',expiresAt:2000}]} as unknown as BarGameLobby;
 expect(barMenuEntries('me',null,lobby,undefined,undefined,vi.fn(),1000)[0]).toMatchObject({inProgress:false});
 expect(barMenuEntries('other',null,lobby,undefined,undefined,vi.fn(),1000)).toEqual([]);
 expect(barMenuEntries('me',null,lobby,undefined,undefined,vi.fn(),2001)).toEqual([]);
});

it('keeps a saved local card party reachable after navigating away',()=>{
 const open=vi.fn();const rows=barMenuEntries('me',null,null,undefined,undefined,open,1000,true);
 expect(rows).toHaveLength(1);rows[0]!.onEnter();expect(open).toHaveBeenCalledWith('/bar/cards/computer/maria');
});

it('does not announce a legacy card match as started before ready confirmation',()=>{
 const lobby={matchId:'old',searching:false,invites:[]};
 expect(barMenuEntries('me',lobby,null,undefined,undefined,vi.fn(),1000)[0]?.inProgress).toBe(false);
});
