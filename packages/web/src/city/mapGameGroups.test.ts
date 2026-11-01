import {describe,it,expect} from 'vitest';
import {mapGameGroups} from './mapGameGroups.js';
import type {ArenaEntry} from './GameHub.js';
const entry=(id:string,kind:ArenaEntry['kind'],extra:Partial<ArenaEntry>={}):ArenaEntry=>({id,kind,eyebrow:id,title:id,subtitle:'',meta:'',ctaLabel:'',onEnter:()=>{},...extra});
describe('map game grouping',()=>{
 it('groups different bar games and keeps group order stable',()=>{const groups=mapGameGroups([entry('b','bar'),entry('d','duel'),entry('c','bar'),entry('daily','daily')]);expect(groups.map(g=>g.id)).toEqual(['daily','duel','bar']);expect(groups[2]!.entries).toHaveLength(2);});
 it('keeps playoff entries out of ordinary duels',()=>{expect(mapGameGroups([entry('playoff-1','duel')])[0]!.id).toBe('tournament');});
 it('uses earliest pending deadline without moving carousel cards',()=>{const g=mapGameGroups([entry('a','duel',{deadlineAt:900}),entry('b','duel',{deadlineAt:300})])[0]!;expect(g.first.id).toBe('b');expect(g.entries.map(e=>e.id)).toEqual(['a','b']);});
 it('drops expired invitations but retains completed daily games',()=>{const groups=mapGameGroups([entry('a','bar',{mapExpiresAt:100}),entry('daily','daily',{dockState:'done'})],101);expect(groups).toHaveLength(1);expect(groups[0]!.done).toBe(true);});
 it('does not mark a whole group done while another game remains',()=>{expect(mapGameGroups([entry('a','classic',{mapDone:true}),entry('b','classic')])[0]!.done).toBe(false);});
});
