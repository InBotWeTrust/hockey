import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {barActionsFor,isBarAssetPath,type BarAction,type BarOccupantId} from '@hockey/game-core';
import {ArrowLeft,X} from 'lucide-react';
import type {BarSceneProps} from './BarScene.js';
import {CharacterEmotionFigure} from './CharacterEmotionFigure.js';
import {CharacterHitArea} from './CharacterHitArea.js';
import {barCharacters,type BarCharacter} from './conversationApi.js';
import {BarAvatarDock} from './BarAvatarDock.js';
import {BarIdentityPanel} from './BarIdentityPanel.js';
import {BarGamesLobby} from './games/BarGamesLobby.js';
import {useHorizontalPan} from './useHorizontalPan.js';
import {useBarLighting} from './barLighting.js';
import {barMapBackground} from './barMapArtwork.js';
import {CharacterGesture} from './characterGesture.js';
import {useBarInvitation,type PendingBarInvitation} from './useBarInvitation.js';
import './bar-map-scene.css';

// Coordinates belong to the full 2172 x 724 source, independent of viewport width.
const classicPlaces:Partial<Record<BarOccupantId,{x:number;floor:number;height:number}>>={
 oleg:{x:16,floor:84,height:46},igor:{x:38,floor:59,height:45},
 veronika:{x:51,floor:85,height:40},timofey:{x:61,floor:88,height:41},
 arsenich:{x:71,floor:91,height:43},maria:{x:80.5,floor:91,height:41},
 grigory:{x:89.5,floor:90,height:42},daria:{x:97,floor:87,height:45},
 broadcasts:{x:23,floor:60,height:0},online:{x:59.5,floor:60,height:0},
};
interface Target {id:string;owner:BarOccupantId;label:string;box:[number,number,number,number];action?:BarAction}
const classicTargets:Target[]=[
 {id:'armwrestling',owner:'oleg',label:'Играть в армрестлинг с Олегом',box:[3.5,46,11,30],action:'armwrestling'},
 {id:'television',owner:'broadcasts',label:'Открыть трансляции',box:[18.3,22.5,10,18],action:'broadcasts'},
 {id:'club-cards',owner:'igor',label:'Клубные карты',box:[42.3,32,3.3,8]},
 {id:'scoreboard',owner:'igor',label:'Спортивный счёт',box:[37.5,4,7.6,14]},
 {id:'billiards',owner:'veronika',label:'Играть в бильярд с Вероникой',box:[49.8,23,5,30],action:'billiards'},
 {id:'terminal',owner:'online',label:'Открыть терминал',box:[57.5,23,4.5,17]},
 {id:'battleship',owner:'timofey',label:'Играть в морской бой с Тимофеем',box:[64,48,4.6,12],action:'battleship'},
 {id:'checkers',owner:'arsenich',label:'Играть в шашки с Арсеничем',box:[74.3,56,5,9],action:'checkers'},
 {id:'maria-cards',owner:'maria',label:'Играть в карты с Марией',box:[80.5,60,5,7],action:'cards'},
 {id:'grigory-cards',owner:'grigory',label:'Играть в очко с Григорием',box:[92.5,60,5.7,8],action:'ochko'},
 {id:'darts',owner:'daria',label:'Играть в дартс с Дарьей',box:[94.5,18,5.4,24],action:'darts'},
];
const layeredPlaces:typeof classicPlaces={
 ...classicPlaces,igor:{x:38,floor:61,height:41},
 oleg:{x:8,floor:76,height:41},veronika:{x:51,floor:73,height:35},
 timofey:{x:64,floor:72,height:36},arsenich:{x:94.1,floor:75,height:35},
 maria:{x:84,floor:72.5,height:35},grigory:{x:74,floor:74,height:35},
 daria:{x:90,floor:64,height:35.5},
};
const newCharacters=new Set(['timofey','arsenich','maria','grigory','daria']);
// The tabletop and all its legs are one independent sprite; click targets cover only the game.
const layeredProps=[
 {id:'armwrestling-table',target:'armwrestling',box:[13.3,45.4,11.4,33.6],game:[13.9,45.4,10.2,12]},
 {id:'battleship-table',target:'battleship',box:[57.7,54,7.5,23],game:[59,54,4.5,10]},
 {id:'checkers-table',target:'checkers',box:[90.8,57,8.6,24.3],game:[91.5,57,7.2,9]},
 {id:'maria-cards-table',target:'maria-cards',asset:'/bar/map-v36/cards-table-v1.webp',box:[79.2,59.5,8,17.5],game:[80,59.5,6.4,7]},
 {id:'grigory-cards-table',target:'grigory-cards',asset:'/bar/map-v36/cards-table-v1.webp',box:[68.5,59,8.8,19.2],game:[69.4,59,7,8]},
] satisfies {id:string;target:string;asset?:string;box:Target['box'];game:Target['box']}[];
const layeredTargets=classicTargets.map(target=>({...target,box:layeredProps.find(prop=>prop.target===target.id)?.game??(target.id==='darts'?[95.2,22,4.3,13.5]:target.box)}));
const rectangle=([left,top,width,height]:Target['box']):CSSProperties=>({left:`${left}%`,top:`${top}%`,width:`${width}%`,height:`${height}%`});

/** Local composition trial. Live bar contracts and the default scene remain unchanged. */
export function BarMapScene({layout,activeSlotId,onSelectSlot,onAction,onTalk,onStaffRoom,onVisitorShop,onBack,notice,onPhysicalIncident,characterEmotions={},activityCounts={},hideIdentity=false,conversationStarted=false,layered=false}:BarSceneProps&{layered?:boolean}){
 const places=layered?layeredPlaces:classicPlaces;
 const targets=layered?layeredTargets:classicTargets;
 const dockLayout=layered?{...layout,slots:[...layout.slots].sort((a,b)=>
  (a.occupantId?places[a.occupantId]?.x??100:100)-(b.occupantId?places[b.occupantId]?.x??100:100))}:layout;
 const lighting=useBarLighting('map',layered);
 const background=layered?barMapBackground(lighting.phase):'/bar/map-v29/day-v1.webp';
 const viewport=useRef<HTMLDivElement>(null),world=useRef<HTMLDivElement>(null);
 const incident=useRef(onPhysicalIncident);incident.current=onPhysicalIncident;
 const gestureTarget=useRef<BarCharacter|null>(null);
 const [gesture]=useState(()=>new CharacterGesture(()=>{if(gestureTarget.current)incident.current?.(gestureTarget.current);}));
 const pan=useHorizontalPan(viewport,()=>gesture.cancel());
 const positioned=useRef(false);
 const [terminalOpen,setTerminalOpen]=useState(false);
 const slot=layout.slots.find(s=>s.id===activeSlotId)??layout.slots[0]!;
 const owner=slot.occupantId,profile=owner?layout.profiles[owner]:null;
 const incomingInvitation=useBarInvitation(owner==='online'&&!hideIdentity);
 const [terminalInvitation,setTerminalInvitation]=useState<PendingBarInvitation|null>(null);
 const openedInvitation=useRef<string|null>(null),terminalDismissed=useRef(false);
 useEffect(()=>{setTerminalInvitation(null);openedInvitation.current=null;terminalDismissed.current=false;},[owner]);
 useEffect(()=>{
  if(owner!=='online'||!incomingInvitation||openedInvitation.current===incomingInvitation.id)return;
  openedInvitation.current=incomingInvitation.id;setTerminalInvitation(incomingInvitation);
  if(!terminalDismissed.current)setTerminalOpen(true);
 },[owner,incomingInvitation]);
 const active=useRef(owner);active.current=owner;
 const destination=(id:BarOccupantId)=>{
  const x=places[id]?.x;if(x===undefined||!viewport.current||!world.current)return null;
  return Math.max(0,Math.min(world.current.clientWidth-viewport.current.clientWidth,world.current.clientWidth*x/100-viewport.current.clientWidth/2));
 };
 const centered=(id:BarOccupantId)=>{const left=destination(id);return left===null||Math.abs((viewport.current?.scrollLeft??0)-left)<=4;};
 const focus=(id:BarOccupantId,behavior:ScrollBehavior='smooth')=>{
  const left=destination(id);if(left===null)return;
  viewport.current?.scrollTo?.({left,behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':behavior});
 };
 const select=(id:BarOccupantId)=>{const next=layout.slots.find(s=>s.occupantId===id);if(next){if(owner!==id||!centered(id))gesture.cancel();if(owner===id)focus(id);onSelectSlot(next.id);}};
 const ready=(id:BarOccupantId)=>{if(owner!==id||!centered(id)){select(id);return false;}return true;};
 const act=(action:BarAction,id:BarOccupantId)=>{if(ready(id))onAction(action,id);};
 useLayoutEffect(()=>{if(owner)focus(owner,positioned.current?'smooth':'auto');positioned.current=true;setTerminalOpen(false);gesture.cancel();gestureTarget.current=null;},[owner]);
 useEffect(()=>()=>gesture.cancel(),[gesture]);
 useEffect(()=>{
  const el=viewport.current;if(!el||typeof ResizeObserver==='undefined')return;
  let width=el.clientWidth,height=el.clientHeight;
  const observer=new ResizeObserver(()=>{if(width===el.clientWidth&&height===el.clientHeight)return;width=el.clientWidth;height=el.clientHeight;gesture.cancel();if(active.current)focus(active.current,'auto');});observer.observe(el);return()=>observer.disconnect();
 },[]);
 return <main className="bar-space bar-map-scene" data-bar-map-preview={layered?'v30':'v29'} data-bar-lighting={lighting.phase}>
  <div ref={viewport} className="bar-map-viewport" aria-label="Панорама бара" tabIndex={0} {...pan}
   onContextMenu={e=>{if((e.target as Element).closest('[data-bar-character]'))e.preventDefault();}}
   onPointerDown={e=>{
    if(e.button!==0||e.isPrimary===false||hideIdentity)return;
    const id=(e.target as Element).closest('[data-bar-character]')?.getAttribute('data-bar-character') as BarCharacter|null;
    if(id&&id===owner&&centered(id)){gestureTarget.current=id;gesture.down(e.pointerId,e.clientX,e.clientY);}else gesture.cancel();
   }}
   onPointerMove={e=>gesture.move(e.pointerId,e.clientX,e.clientY)}
   onPointerUp={e=>gesture.up(e.pointerId)} onPointerCancel={()=>gesture.cancel()}>

   <div ref={world} className="bar-map-world">
    {layered&&lighting.previous&&<img className="bar-map-background" src={barMapBackground(lighting.previous)} alt="" draggable={false}/>}
    <img key={background} className={`bar-map-background${layered&&lighting.previous?' bar-map-background--enter':''}`} data-bar-map-background src={background} alt="" draggable={false}/>
    {layout.slots.map(s=>{
     const id=s.occupantId,place=id?places[id]:null,composition=id?layout.profiles[id].composition:null;
     if(!id||!place?.height||!isBarAssetPath(composition)||!barCharacters.includes(id as BarCharacter))return null;
     const width=place.height*2/9;
     return <div key={s.id} className={`bar-map-character${id==='igor'?' bar-map-character--behind-counter':''}`} data-map-character={id}
      style={{left:`${place.x-width/2}%`,top:`${place.floor-place.height}%`,width:`${width}%`,height:`${place.height}%`}}
      onClick={()=>select(id)}>
      {layered&&newCharacters.has(id)?<img src={id==='arsenich'?'/bar/map-v36/arsenich-neutral-v1.webp':`/bar/map-v30/${id}-neutral-v1.webp`} alt="" draggable={false} style={{width:'100%',height:'100%',objectFit:'contain'}}/>:<CharacterEmotionFigure character={id} emotion={characterEmotions[id as BarCharacter]??'neutral'} fallback={composition} style={{width:'100%',height:'100%',objectFit:'contain'}} onFallbackError={()=>{}}/>}
      {!hideIdentity&&<CharacterHitArea character={id as BarCharacter} x={50} y={50} style={{inset:0,width:'100%',height:'100%'}}/>}
     </div>;
    })}
    <img className={layered?'bar-map-counter bar-map-counter--sprite':'bar-map-counter'} src={layered?'/bar/map-v31/counter-v1.webp':background} style={layered?rectangle([28.5,31,20,30]):undefined} alt="" draggable={false}/>
    {layered&&layeredProps.map(prop=><img key={prop.id} data-map-prop={prop.id} className="bar-map-prop" src={'asset' in prop?prop.asset:`/bar/map-v30/${prop.id}-v1.webp`} style={rectangle(prop.box)} alt="" draggable={false}/>)}
    {!hideIdentity&&targets.map(target=><button key={target.id} className="bar-map-target" data-map-target={target.id} aria-label={target.label} style={rectangle(target.box)} onClick={()=>{
     if(!ready(target.owner))return;
     if(target.action)onAction(target.action,target.owner);
     else if(target.id==='terminal')setTerminalOpen(true);
     else if(target.id==='club-cards')onVisitorShop?.();
    }}><span className="bar-map-pulse" aria-hidden="true"><span className="bar-map-pulse__ring"/></span></button>)}
    {!hideIdentity&&onStaffRoom&&<button className="bar-map-target bar-map-target--secret" aria-label="Открыть служебную дверь" style={rectangle([27,16,3.3,8])} onClick={()=>onStaffRoom(layout.slots.find(s=>s.occupantId==='broadcasts')?.id??slot.id)}/>}
   </div>
  </div>
  <header className="bar-space__header bonus-games-catalog__header">{onBack&&<button className="icon-btn catalog-header-back" aria-label="Назад" onClick={onBack}><ArrowLeft size={16}/></button>}<h1 className="screen-title-on-arena">Бар «4-й период»</h1></header>
  {notice&&<div className="bar-space__notice">{notice}</div>}
  {terminalOpen&&<section className="bar-space__actions bar-space__actions--terminal" aria-label="Играть онлайн"><div className="bar-terminal-header"><span>Играть онлайн</span><button className="icon-btn" aria-label="Закрыть терминал" onClick={()=>{terminalDismissed.current=true;setTerminalOpen(false);}}><X size={19}/></button></div><BarGamesLobby key={terminalInvitation?.id??'manual'} initial={terminalInvitation?.kind??'cards'} embedded/></section>}
  {!hideIdentity&&<div className={`bar-bottom-chrome${terminalOpen?' bar-bottom-chrome--terminal-open':''}`}>
   <section className="bar-space__actions" aria-live="polite" hidden={terminalOpen}>{profile&&owner&&<BarIdentityPanel key={owner} profile={profile} characterId={owner} actions={barActionsFor(owner)} conversationStarted={conversationStarted}
    {...(onTalk&&barCharacters.includes(owner as BarCharacter)?{onTalk:()=>onTalk(owner as BarCharacter)}:{})}
    onAction={action=>{if(owner==='online')setTerminalOpen(true);else act(action,owner);}}/>}</section>
   <BarAvatarDock layout={dockLayout} activeSlotId={activeSlotId} activityCounts={activityCounts} onSelectSlot={id=>{const next=layout.slots.find(s=>s.id===id);if(next?.occupantId)select(next.occupantId);}}/>
  </div>}
 </main>;
}
