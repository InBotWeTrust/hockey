import {CityTraffic} from './CityTraffic.js';
import {CityCaretaker,useCaretakerVisit} from './CityCaretaker.js';
import type {CaretakerKind} from './caretakerSchedule.js';
import type {GameDockStatus} from './gameDockStatus.js';
import {useEffect,useLayoutEffect,useRef,useState,type ReactNode,type CSSProperties} from 'react';
import {ChevronRight,Snowflake,Goal,User,ShieldCheck,Map as MapIcon} from 'lucide-react';
import './city-map.css';
import {WeatherOverlay} from './WeatherOverlay.js';
import {useWeatherCycle,type WeatherKind} from './weather.js';
import {useCityImage} from './lighting.js';
type Level='beginner'|'amateur'|'professional';
type Props={maintenanceBlocked?:boolean;caretakerPreview?:CaretakerKind;isAdmin?:boolean;adminCount?:number;referralCount?:number;gameStatus?:GameDockStatus;onOpenGamePanel?:()=>void;gamePanel?:ReactNode;startAtDaily?:boolean;weatherOverride?:WeatherKind;owner?:string|undefined;level:Level;daily:string;training:string;tasks:string;bonus:string;attention?:boolean;avatarUrl?:string|null;chatCount?:number;gameCount?:number;taskCount?:number;barCount?:number;onNavigate:(path:string)=>void};
const places=[
 {id:'profile',name:'Моя квартира',x:5.8,y:35,w:4,h:9},
 {id:'yard',name:'Дворовый каток',x:12.7,y:52,w:16,h:18,thumb:[8.6,47]},
 {id:'shop',name:'Магазин',x:25.6,y:39,w:7.5,h:12,thumb:[22.5,31]},
 {id:'tasks',name:'Задания',x:27,y:58.5,w:8,h:13,thumb:[24.8,59]},
 {id:'chat',name:'Телефонная будка',x:30.1,y:62,w:2.6,h:8.5,thumb:[27.9,70]},
 {id:'bank',name:'Банк',x:36.2,y:36.5,w:8,h:16,thumb:[34.7,28]},
 {id:'stadium',name:'Стадион «Центральный»',x:44.8,y:51,w:14,h:20,thumb:[43.9,52.6]},
 {id:'gym',name:'Спортзал',x:52.5,y:37,w:9.5,h:14,thumb:[54,28.9]},
 {id:'bar',name:'Бар "4-й период"',x:59.4,y:60,w:10.5,h:17,thumb:[60.3,62.6]},
 {id:'fame',name:'Зал славы',x:64.5,y:36,w:9,h:17,thumb:[66.2,26.1]},
 {id:'bonus',name:'Бонусные игры',x:72.3,y:59,w:8,h:17,thumb:[75.8,62.9]},
 {id:'pro',name:'Арена Ультимейт',x:87,y:42,w:25,h:34,thumb:[92,37]},
];
export function CityMap(props:Props){
 const {weather}=useWeatherCycle();
 const caretaker=useCaretakerVisit(props.owner,props.maintenanceBlocked??true);
 const district=useRef<HTMLElement>(null),panel=useRef<HTMLElement>(null);
 useLayoutEffect(()=>{
  const root=district.current,menu=panel.current;if(!root||!menu)return;
  const update=()=>root.style.setProperty('--city-menu-top',`${menu.getBoundingClientRect().top-root.getBoundingClientRect().top}px`);
  update();const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(update);observer?.observe(root);observer?.observe(menu);window.addEventListener('resize',update);
  return()=>{observer?.disconnect();window.removeEventListener('resize',update);};
 },[]);
 const {owner,level,daily,training,tasks,bonus,onNavigate}=props;
 const navigationKey=`city-navigation-collapsed-v1:${props.owner??'anonymous'}`;
 const [navigationCollapsed,setNavigationCollapsed]=useState(()=>{try{return localStorage.getItem(navigationKey)==='1';}catch{return false;}});
 const toggleNavigation=()=>{setNavigationCollapsed(value=>{const next=!value;try{localStorage.setItem(navigationKey,next?'1':'0');}catch{/* Storage is optional. */}return next;});};
 const navigationCount=(props.chatCount??0)+(props.gameCount??0)+(props.taskCount??0)+(props.barCount??0)+(props.referralCount??0)+(props.isAdmin?(props.adminCount??0):0);
 const dailyId={beginner:'yard',amateur:'stadium',professional:'pro'}[level];
 const dailyVenue=places.find(p=>p.id===dailyId)!;
 const storageKey=`city-place-v2:${owner??'anonymous'}:${level}`;
 const [selected,setSelected]=useState(()=>{if(props.startAtDaily)return dailyId;try{const stored=sessionStorage.getItem(storageKey);return places.some(p=>p.id===stored)?stored!:dailyId;}catch{return dailyId;}});
 const [flash,setFlash]=useState<string|null>(null);
 const viewport=useRef<HTMLDivElement>(null),world=useRef<HTMLDivElement>(null),dock=useRef<HTMLElement>(null);
 const previousCollapse=useRef(navigationCollapsed);
 useLayoutEffect(()=>{const reopening=previousCollapse.current&&!navigationCollapsed;previousCollapse.current=navigationCollapsed;if(!reopening)return;const menu=dock.current,active=menu?.querySelector<HTMLElement>('[aria-pressed="true"]');if(menu&&active)menu.scrollTo?.({left:active.offsetLeft-menu.offsetLeft-menu.clientWidth/2+23,behavior:'auto'});},[navigationCollapsed]);
 const timer=useRef<ReturnType<typeof setTimeout>>();
 const drag=useRef<{x:number;y:number;left:number;type:string;moved:boolean}|null>(null);
 const blockUntil=useRef(0);
 const positioned=useRef(false);
 const currentPlace=useRef(selected);currentPlace.current=selected;
 const place=places.find(p=>p.id===selected)!;
 const image=useCityImage();
 const targetLeft=(p:typeof places[number])=>{const el=viewport.current,w=world.current;if(!el||!w)return null;return Math.max(0,Math.min(Math.max(0,w.clientWidth-el.clientWidth),w.clientWidth*p.x/100-el.clientWidth/2));};
 const center=(p:typeof places[number],behavior:ScrollBehavior)=>{const left=targetLeft(p);if(left!==null)viewport.current?.scrollTo?.({left,behavior});const active=dock.current?.querySelector<HTMLElement>('[aria-pressed="true"]');if(active&&dock.current)dock.current.scrollTo?.({left:active.offsetLeft-dock.current.offsetLeft-dock.current.clientWidth/2+23,behavior});};
 const select=(id:string)=>{if(id===selected)center(place,window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth');setSelected(id);try{sessionStorage.setItem(storageKey,id);}catch{/* Optional selection persistence. */}clearTimeout(timer.current);setFlash(null);if(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)timer.current=setTimeout(()=>setFlash(id),280);};
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 useLayoutEffect(()=>{center(place,positioned.current&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'smooth':'auto');positioned.current=true;},[place]);
 useEffect(()=>{const el=viewport.current,w=world.current;if(!el||!w||typeof ResizeObserver==='undefined')return;let width=el.clientWidth,height=el.clientHeight;const observer=new ResizeObserver(()=>{if(width===el.clientWidth&&height===el.clientHeight)return;width=el.clientWidth;height=el.clientHeight;const current=places.find(p=>p.id===currentPlace.current)!;el.scrollTo?.({left:w.clientWidth*current.x/100-width/2,behavior:'auto'});});observer.observe(el);return()=>observer.disconnect();},[]);

 const openBuilding=(p:typeof places[number])=>{
  if(p.id==='chat'){onNavigate('/chat');return;}
  const left=targetLeft(p);
  if(p.id!==selected||left===null||Math.abs((viewport.current?.scrollLeft??0)-left)>4){select(p.id);return;}
  const routes:Record<string,string>={profile:'/profile',yard:'/?view=training&from=sections',stadium:'/?view=amateur&from=sections',shop:'/inventory',bank:'/inventory?tab=bank',tasks:'/achievements',bar:'/bar',bonus:'/bonus-games',chat:'/chat'};
  const path=p.id===dailyId?'/daily':routes[p.id];
  if(path)onNavigate(path);
 };
 let description='';const actions:{label:string;path:string;kind?:string}[]=[];
 if(selected==='profile'){description='Мой профиль, прогресс и настройки';actions.push({label:'Перейти в профиль',path:'/profile'});}
 if(selected==='yard'){description=level==='beginner'?`${daily} · Тренировка: ${training}`:'Открытая тренировка и упражнения';actions.push({label:'Тренировка',path:'/?view=training&from=sections',kind:'training'});}
 if(selected==='stadium'){description=level==='amateur'?daily:'Дуэли и турниры';actions.push({label:'Дуэли и турниры',path:'/?view=amateur&from=sections'});}
 if(selected==='tasks'){description=tasks;actions.push({label:'Открыть задания',path:'/achievements'});}
 if(selected==='shop'){description='Инвентарь и валюта';actions.push({label:'Войти в магазин',path:'/inventory'});}
 if(selected==='bank'){description='Валюта и пополнение';actions.push({label:'Открыть банк',path:'/inventory?tab=bank'});}
 if(selected==='bar'){description='Трансляции, игры и общение';actions.push({label:'Войти в бар',path:'/bar'});}
 if(selected==='chat'){description='Сообщения и общение';actions.push({label:'Открыть чат',path:'/chat'});}
 if(selected==='bonus'){description=bonus;actions.push({label:'Выбрать игру',path:'/bonus-games'});}
 if(selected==='gym')description='Физическая подготовка · в разработке';
 if(selected==='fame')description='Лучшие игроки и результаты · в разработке';
 if(selected==='pro')description=level==='professional'?`${daily} · Игры самого высокого уровня · в разработке`:'Игры самого высокого уровня · в разработке';
 if(selected===dailyId)actions.push({label:'Ежедневная игра',path:'/daily',kind:'daily'});
 const badge=(id:string)=>{
  const count=id==='chat'?props.chatCount:id==='stadium'?props.gameCount:id==='tasks'?props.taskCount:id==='bar'?props.barCount:0;
  const label=id==='chat'?'Непрочитанные':id==='stadium'?'Дуэли и турниры':id==='tasks'?'Задания и челленджи':'Приглашения в бар';
  return (count??0)>0?<small className="district-badge" aria-label={`${label}: ${count}`}>{count!>99?'99+':count}</small>:null;
 };
 return <section ref={district} className="district" aria-label="Хоккейный район">
  <div ref={viewport} className="district-viewport" tabIndex={0} aria-label="Карта района"
   onPointerDown={e=>{if(!e.isPrimary||e.button!==0)return;blockUntil.current=0;drag.current={x:e.clientX,y:e.clientY,left:e.currentTarget.scrollLeft,type:e.pointerType,moved:false};e.currentTarget.scrollTo?.({left:e.currentTarget.scrollLeft,behavior:'instant' as ScrollBehavior});}}
   onPointerMove={e=>{const d=drag.current;if(!d)return;if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>8)d.moved=true;if(d.moved&&d.type==='mouse'){e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.scrollLeft=d.left+d.x-e.clientX;}}}
   onPointerUp={()=>{if(drag.current?.moved)blockUntil.current=performance.now()+500;drag.current=null;}}
   onPointerCancel={()=>{blockUntil.current=performance.now()+500;drag.current=null;}}
   onClickCapture={e=>{if(e.detail!==0&&(drag.current?.moved||performance.now()<blockUntil.current)){e.preventDefault();e.stopPropagation();}}}>
   <div ref={world} className="district-world"><CityBackground image={image}/><CityTraffic owner={owner} night={image.includes("city-night-")||image.includes("city-sunset-")}/>{!props.maintenanceBlocked&&(props.caretakerPreview??caretaker)&&<CityCaretaker kind={(props.caretakerPreview??caretaker)!} venue={dailyId as 'yard'|'stadium'|'pro'}/> }
    {places.map(p=><button key={p.id} aria-label={`На карте: ${p.name}`} className={`district-hit${p.id==='profile'?' district-apartment':''}${flash===p.id?' is-flashing':''}`} style={{left:`${p.x}%`,top:`${p.y}%`,width:`${p.w}%`,height:`${p.h}%`}} onClick={()=>openBuilding(p)}>{p.id==='profile'&&<span className="district-apartment-avatar" aria-hidden="true"><User/></span>}</button>)}
    {props.gamePanel&&<div className="district-game-anchor" data-venue={dailyId} style={{left:`${dailyVenue.x}%`} as CSSProperties} onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}>{props.gamePanel}</div>}
   </div>
  </div>
  <WeatherOverlay key={props.weatherOverride??weather} weather={props.weatherOverride??weather}/>
  <section ref={panel} className={`district-panel${navigationCollapsed?' district-panel--collapsed':''}`} aria-label="Выбранное место">
   <button type="button" className="icon-btn district-navigation-toggle" aria-label={navigationCollapsed?'Показать навигацию':'Свернуть навигацию'} title={navigationCollapsed?'Показать навигацию':'Свернуть навигацию'} aria-expanded={!navigationCollapsed} onClick={toggleNavigation}>{navigationCollapsed?<MapIcon aria-hidden="true"/>:<span className="district-navigation-handle" aria-hidden="true"/>}{navigationCollapsed&&navigationCount>0&&<small className="district-badge" aria-label={`Уведомления: ${navigationCount}`}>{navigationCount>99?'99+':navigationCount}</small>}{navigationCollapsed&&props.gameStatus?.label&&<em className="district-game-status" aria-label={`Статус игр: ${props.gameStatus.label}`}>{props.gameStatus.label}</em>}</button>
   {!navigationCollapsed&&<><div className="district-identity"><div><h1>{place.name}</h1><p>{description}{selected==='tasks'&&props.attention&&<span aria-label="Требуется действие"> · Есть награда</span>}</p></div><div className="district-actions">{actions.map(a=><button className="icon-btn" key={a.label} aria-label={a.label} title={a.label} onClick={()=>onNavigate(a.path)}>{a.kind==='training'?<Snowflake/>:a.kind==='daily'?<Goal/>:<ChevronRight/>}</button>)}</div></div>
   <nav className="district-dock" ref={dock} aria-label="Места района"><button aria-label="Открыть профиль" aria-pressed={selected==='profile'} title="Мой профиль" onClick={()=>openBuilding(places[0]!)}><span className="district-profile">{props.avatarUrl?<img src={props.avatarUrl} alt=""/>:<User aria-hidden="true"/>}</span>{(props.referralCount??0)>0&&<small className="district-badge" aria-label={`Награды за приглашения: ${props.referralCount}`}>{props.referralCount!>99?'99+':props.referralCount}</small>}</button>{places.filter(p=>p.id!=='profile').map(p=><button key={p.id} aria-label={`Выбрать ${p.name}`} title={p.name} aria-pressed={selected===p.id} onClick={()=>{select(p.id);if(p.id===dailyId&&props.gameStatus?.urgent)props.onOpenGamePanel?.();}}><span style={{backgroundImage:`url(${image})`,backgroundPosition:`${p.thumb?.[0]??p.x}% ${p.thumb?.[1]??p.y}%`}}/>{badge(p.id)}{p.id===dailyId&&props.gameStatus?.label&&<em className="district-game-status" aria-label={`Статус игр: ${props.gameStatus.label}`}>{props.gameStatus.label}</em>}</button>)}{props.isAdmin&&<button aria-label="Открыть админку" title="Админ" onClick={()=>onNavigate('/admin')}><span className="district-profile district-admin"><ShieldCheck size={18} strokeWidth={1.5} aria-hidden="true"/></span>{(props.adminCount??0)>0&&<small className="district-badge" aria-label={`События администратора: ${props.adminCount}`}>{props.adminCount!>99?'99+':props.adminCount}</small>}</button>}</nav></>}
  </section>
 </section>;
}

function CityBackground({image}:{image:string}){
 const [previous,setPrevious]=useState(image);
 useEffect(()=>{const timer=setTimeout(()=>setPrevious(image),1000);return()=>clearTimeout(timer);},[image]);
 return <>
 <img src={previous} alt="" aria-hidden="true" draggable={false}/>
 <img key={image} className={previous!==image?'district-light-enter':undefined} src={image} alt="Зимний хоккейный район" draggable={false} decoding="async"/>
 </>;
}
