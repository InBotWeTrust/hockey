import type {ComponentType} from 'react';
import {Goal,Crosshair,Swords,Trophy,Dices,Target,Ship,BicepsFlexed,Club} from 'lucide-react';
import type {ArenaEntry} from './GameHub.js';
import {mapGameGroups} from './mapGameGroups.js';
import {MapActionButton} from './MapActionButton.js';
export function CardsIcon(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="8" y="3" width="12" height="17" rx="2"/><path d="M5 6 2 7l4 15 10-3M14 8l3 4-3 4-3-4z"/></svg>;}
export function BilliardsIcon(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10" cy="13" r="8"/><circle cx="10" cy="13" r="4"/><path d="m17 8 5-6"/><text x="10" y="15.5" stroke="none" fill="currentColor" fontSize="7" textAnchor="middle">8</text></svg>;}
function CheckersIcon(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><ellipse cx="9" cy="8" rx="7" ry="4"/><path d="M2 8v4c0 5 14 5 14 0V8M8 17c1 5 14 5 14 0v-4c0-2-2-3-4-4"/></svg>;}
const barIcons:Record<string,ComponentType>={'Карты':CardsIcon,'Карточный стол':CardsIcon,'Бильярд':BilliardsIcon,'Дартс':Target,'Морской бой':Ship,'Армрестлинг':BicepsFlexed,'Очко':Club,'Шашки':CheckersIcon};
export function MapGameActions({entries,onOpen,now}:{entries:ArenaEntry[];onOpen:(id:string,firstId:string)=>void;now:number}){
 return <>{mapGameGroups(entries,now).map(group=>{
 const icons={daily:Goal,training:Crosshair,duel:Swords,tournament:Trophy,bar:Dices};
 const Icon=group.id==='bar'&&group.entries.length===1?(barIcons[group.first.eyebrow]??Dices):icons[group.id];
 const label=group.id==='bar'&&group.entries.length===1?group.first.eyebrow:({daily:'Ежедневная',training:'Тренировка',duel:'Дуэли',tournament:'Турнир',bar:'Игры в баре'})[group.id];
 const note=group.first.mapLabel??(group.first.mapExpiresAt?`Ждём ${Math.floor(Math.max(0,group.first.mapExpiresAt-now)/60000)}:${String(Math.floor(Math.max(0,group.first.mapExpiresAt-now)/1000)%60).padStart(2,'0')}`:group.first.inProgress?'В игре':'Открыть');
 const progress=(group.id==='daily'||group.id==='training')&&/^\d+\/\d+$/.test(note)?note:'';
 return <MapActionButton key={group.id} label={label} progress={progress} note={progress?'':note} timer={group.first.mapTimer ?? ''} icon={<Icon/>} count={group.entries.length>1||group.entries.some(entry=>entry.attention)?group.entries.length:0} done={group.done} onClick={()=>onOpen(group.id,group.first.id)}/>;
 })}</>;
}
