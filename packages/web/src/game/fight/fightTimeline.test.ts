import { it, expect } from 'vitest';
import { createFightState, DEFAULT_FIGHT_RULES as ONLINE_RULES, advanceFight } from '@hockey/game-core';
import { FightTimeline } from './fightTimeline.js';
const DEFAULT_FIGHT_RULES={...ONLINE_RULES,windupMs:250};
const initial=()=>createFightState(DEFAULT_FIGHT_RULES,0);
it('immediately predicts windup then shows unresolved strike and recovery without restart on ack',()=>{
 const s=initial();const t=new FightTimeline(s);t.predict('local',0,100,'head',false);
 expect(t.frame(s,0,101).pose).toBe('idle');expect(t.frame(s,0,350).pose).toBe('attack_head');
 const ack=advanceFight(s,[{kind:'attack',zone:'head',player:0,seq:1,phaseId:0,effectiveAtMs:120,actionId:'local'}],300).state;
 expect(t.frame(ack,0,360).progress).toBeGreaterThan(.5);expect(t.frame(ack,0,601).pose).toBe('idle');
});
it('shows late strike before reaction and deduplicates repeated snapshots',()=>{
 const s=initial();const t=new FightTimeline(s);
 const hit=advanceFight(s,[{kind:'attack',zone:'head',player:1,seq:1,phaseId:0,effectiveAtMs:0}],500).state;
 t.observe(hit,500);expect(t.frame(hit,1,500).pose).toBe('attack_head');expect(t.frame(hit,0,500).pose).not.toBe('hit');
 expect(t.frame(hit,0,580).pose).toBe('hit');t.observe(hit,600);expect(t.frame(hit,0,781).pose).toBe('idle');
 expect(new FightTimeline(hit).frame(hit,1,900).pose).toBe('idle');
});
it('cancelled prediction cannot continue striking and rejection clears prediction',()=>{
 const s=initial();const t=new FightTimeline(s);t.predict('a',1,100,'head',false);
 const hit=advanceFight(s,[{kind:'attack',zone:'head',player:0,seq:1,phaseId:0,effectiveAtMs:0},{kind:'attack',zone:'head',player:1,seq:1,phaseId:0,effectiveAtMs:100,actionId:'a'}],500).state;
 t.observe(hit,500);expect(t.frame(hit,1,600).pose).not.toBe('attack_head');
 t.clearPrediction();expect(t.frame(s,1,200).pose).toBe('idle');
});

it('prepares a crouching strike without raising a guard',()=>{
 const s=initial();const t=new FightTimeline(s);t.predict('low',0,100,'body',true);
 expect(t.frame(s,0,101).pose).toBe('crouch');
 expect(t.frame(s,0,350).pose).toBe('crouch_attack');
});

it('shows a new confirmed hit even when its snapshot arrives more than 1500ms late',()=>{
 const s=initial();const t=new FightTimeline(s);
 const hit=advanceFight(s,[{kind:'attack',zone:'head',player:0,seq:1,phaseId:0,effectiveAtMs:0}],500).state;
 t.observe(hit,3000);expect(t.frame(hit,1,3080).reaction?.kind).toBe('hit');
 t.observe(hit,3300);expect(t.frame(hit,1,3300).reaction).toBeUndefined();
});
