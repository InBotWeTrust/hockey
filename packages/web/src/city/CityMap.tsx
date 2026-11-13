import {CityBackground} from './CityBackground.js';
import {rememberChatReturn} from '../chat/chatReturn.js';
import {sectionEntryRoute} from './sectionEntry.js';
import '../components/navigation-geometry.css';
import {useHorizontalPan} from '../bar/useHorizontalPan.js';
import {StudioCityMotion} from './StudioCityMotion.js';
import {CityCaretaker,useCaretakerVisit} from './CityCaretaker.js';
import type {CaretakerKind} from './caretakerSchedule.js';
import type {GameDockStatus} from './gameDockStatus.js';
import {Fragment,useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {ChevronRight,User,ShieldCheck,Shirt,Newspaper,Fence,Store,ClipboardList,Landmark,Goal,Dumbbell,Beer,Trophy,Gamepad2,Shield,Map as MapIcon} from 'lucide-react';
import './city-map.css';
import {CityWeatherWidget} from './CityWeatherWidget.js';
import {WeatherOverlay} from './WeatherOverlay.js';
import type {WeatherKind} from './weather.js';
import type {SelectedCity,CityWeather} from './cityLocation.js';
import {useCityImage} from './lighting.js';
type Level='beginner'|'amateur'|'professional';
type Props={city?:SelectedCity|null;currentWeather?:CityWeather|null;weatherStale?:boolean;weatherLoading?:boolean;maintenanceBlocked?:boolean;caretakerPreview?:CaretakerKind;isAdmin?:boolean;adminCount?:number;referralCount?:number;gameStatus?:GameDockStatus;onOpenGamePanel?:()=>void;gamePanel?:ReactNode;startAtDaily?:boolean;weatherOverride?:WeatherKind;owner?:string|undefined;level:Level;daily:string;training:string;tasks:string;bonus:string;attention?:boolean;avatarUrl?:string|null;chatCount?:number;gameCount?:number;taskCount?:number;barCount?:number;onNavigate:(path:string)=>void};
const basePlaces=[
 {id:'profile',name:'Моя квартира',x:7.2,y:36,w:3,h:8},
 {id:'yard',name:'Дворовый каток',x:8.847243271396138,y:58.50103286269475,w:17.674288443740622,h:20.650549481232634,thumb:[8.847243271396138,58.50103286269475]},
 {id:'shop',name:'Магазин',x:28.67103429185496,y:61.139598994525066,w:6.815514038689457,h:13.929249969937496,thumb:[28.67103429185496,61.139598994525066]},
 {id:'tasks',name:'Задания',x:39.395719929442386,y:60.39220355130808,w:6.901796434545493,h:15.082196893974787,thumb:[39.395719929442386,60.39220355130808]},
 {id:'chat',name:'Лента',x:20.866899807993367,y:47.145508124081516,w:1.6455989669652167,h:7.518182021471064,thumb:[20.866899807993367,47.145508124081516]},
 {id:'bank',name:'Банк',x:27.57693297769382,y:39.92718850497972,w:7.888254638020582,h:19.211703184613686,thumb:[27.57693297769382,39.92718850497972]},
 {id:'stadium',name:'Стадион «Центральный»',x:44.49462391527922,y:42.84123317686651,w:13.67187666666667,h:21.50378669500528,thumb:[44.49462391527922,42.84123317686651]},
 {id:'gym',name:'Спортзал',x:61.215532604721126,y:40.29530283733615,w:10.20077269774792,h:15.348634010695134,thumb:[61.215532604721126,40.29530283733615]},
 {id:'bar',name:'Бар "4-й период"',x:66.64332491379264,y:61.649587268095345,w:9.36103334576009,h:16.947858384634266,thumb:[66.64332491379264,61.649587268095345]},
 {id:'fame',name:'Зал славы',x:80.11399620239426,y:58.23904816408926,w:10.295012869199732,h:21.455075824638254,thumb:[80.11399620239426,58.23904816408926]},
 {id:'bonus',name:'Бонусные игры',x:53.299677664227445,y:59.07352311638164,w:7.255788510392937,h:17.72655670281085,thumb:[53.299677664227445,59.07352311638164]},
 {id:'pro',name:'Арена Ультимейт',x:86.62486113391556,y:40.25314452946448,w:26.297311759692978,h:34.68491373685769,thumb:[86.62486113391556,40.25314452946448]},
];
const locationIcons:Record<string,typeof Shirt>={feed:Newspaper,yard:Fence,shop:Store,tasks:ClipboardList,bank:Landmark,stadium:Goal,gym:Dumbbell,bar:Beer,fame:Trophy,bonus:Gamepad2,pro:Shield,locker:Shirt};
function LocationIcon({id}:{id:string}){const Icon=locationIcons[id]??MapIcon;return <span className="district-profile district-location-icon"><Icon size={24} strokeWidth={1.5} aria-hidden="true"/></span>;}
const homeVenues = {beginner:'yard',amateur:'stadium',professional:'pro'} as const;
const lockerPositions = {
 beginner: {x:21.21965028706964,y:59.78234381487841}, amateur: {x:44.49,y:46}, professional: {x:85.77,y:50},
} as const;
export function CityMap(props:Props){
 const places=useMemo<Array<(typeof basePlaces)[number]>>(()=>{const locker={id:'locker',name:'Раздевалка',...lockerPositions[props.level],w:3,h:8};return basePlaces.flatMap(place=>place.id===homeVenues[props.level]?[place,locker]:[place]);}, [props.level]);
 const weather=props.currentWeather?.kind??'clear';
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
 const dailyId=homeVenues[level];
 const apartment=places.find(p=>p.id==='profile')!;
 const storageKey=`city-place-v2:${owner??'anonymous'}:${level}`;
 const [selected,setSelected]=useState(()=>{if(props.startAtDaily)return dailyId;try{const stored=sessionStorage.getItem(storageKey);return places.some(p=>p.id===stored)?stored!:dailyId;}catch{return dailyId;}});
 const [flash,setFlash]=useState<string|null>(null);
 const viewport=useRef<HTMLDivElement>(null),world=useRef<HTMLDivElement>(null),dock=useRef<HTMLElement>(null);
 const dockPan=useHorizontalPan(dock);
 const previousCollapse=useRef(navigationCollapsed);
 useLayoutEffect(()=>{const reopening=previousCollapse.current&&!navigationCollapsed;previousCollapse.current=navigationCollapsed;if(!reopening)return;const menu=dock.current,active=menu?.querySelector<HTMLElement>('[aria-pressed="true"]');if(menu&&active)menu.scrollTo?.({left:active.offsetLeft-menu.offsetLeft-menu.clientWidth/2+active.offsetWidth/2,behavior:'auto'});},[navigationCollapsed]);
 const timer=useRef<ReturnType<typeof setTimeout>>();
 const drag=useRef<{x:number;y:number;left:number;type:string;moved:boolean}|null>(null);
 const blockUntil=useRef(0);
 const positioned=useRef(false);
 const currentPlace=useRef(selected);currentPlace.current=selected;
 const place=places.find(p=>p.id===selected)!;
 const image=useCityImage(props.city);
 const targetLeft=(p:typeof places[number])=>{const el=viewport.current,w=world.current;if(!el||!w)return null;return Math.max(0,Math.min(Math.max(0,w.clientWidth-el.clientWidth),w.clientWidth*p.x/100-el.clientWidth/2));};
 const center=(p:typeof places[number],behavior:ScrollBehavior)=>{const left=targetLeft(p);if(left!==null)viewport.current?.scrollTo?.({left,behavior});const active=dock.current?.querySelector<HTMLElement>('[aria-pressed="true"]');if(active&&dock.current)dock.current.scrollTo?.({left:active.offsetLeft-dock.current.offsetLeft-dock.current.clientWidth/2+active.offsetWidth/2,behavior});};
 const select=(id:string)=>{if(id===selected)center(place,window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth');setSelected(id);try{sessionStorage.setItem(storageKey,id);}catch{/* Optional selection persistence. */}clearTimeout(timer.current);setFlash(null);if(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)timer.current=setTimeout(()=>setFlash(id),280);};
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 useLayoutEffect(()=>{center(place,positioned.current&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'smooth':'auto');positioned.current=true;},[place]);
 useEffect(()=>{const el=viewport.current,w=world.current;if(!el||!w||typeof ResizeObserver==='undefined')return;let width=el.clientWidth,height=el.clientHeight;const observer=new ResizeObserver(()=>{if(width===el.clientWidth&&height===el.clientHeight)return;width=el.clientWidth;height=el.clientHeight;const current=places.find(p=>p.id===currentPlace.current)!;el.scrollTo?.({left:w.clientWidth*current.x/100-width/2,behavior:'auto'});});observer.observe(el);return()=>observer.disconnect();},[]);

 const entryRoute=(id:string,path:string)=>sectionEntryRoute(id,path,owner,level,import.meta.env.DEV||import.meta.env.VITE_TRAINING_EXERCISES_ENABLED===true);
 const openBuilding=(p:typeof places[number])=>{
  // Persist before navigation: the map may unmount before a selection effect runs.
  select(p.id);
  if(p.id==='chat')rememberChatReturn(owner,'/sections');
  const routes:Record<string,string>={profile:'/profile',locker:'/locker-room',yard:'/?view=training&from=sections',stadium:'/?view=amateur&from=sections',shop:'/inventory',bank:'/inventory?tab=bank',tasks:'/achievements',bar:'/bar',bonus:'/bonus-games',chat:'/chat?view=feed'};
  const path=p.id===dailyId?'/daily':routes[p.id];
  if(path)onNavigate(entryRoute(p.id,path));
 };
 let description='';const actions:{label:string;path:string;}[]=[];
 if(selected==='locker'){description='Выбор инвентаря перед игрой';actions.push({label:'Открыть раздевалку',path:'/locker-room'});}
 if(selected==='profile'){description='Мой профиль, прогресс и настройки';actions.push({label:'Перейти в профиль',path:'/profile'});}
 if(selected==='yard'){description=level==='beginner'?`${daily} · Тренировка: ${training}`:'Открытая тренировка и упражнения';actions.push({label:'Войти во двор',path:selected===dailyId?'/daily':'/?view=training&from=sections'});}
 if(selected==='stadium'){description=level==='amateur'?daily:'Дуэли и турниры';actions.push({label:'Войти на стадион',path:selected===dailyId?'/daily':'/?view=amateur&from=sections'});}
 if(selected==='tasks'){description=tasks;actions.push({label:'Открыть задания',path:'/achievements'});}
 if(selected==='shop'){description='Инвентарь и валюта';actions.push({label:'Войти в магазин',path:'/inventory'});}
 if(selected==='bank'){description='Валюта и пополнение';actions.push({label:'Открыть банк',path:'/inventory?tab=bank'});}
 if(selected==='bar'){description='Трансляции, игры и общение';actions.push({label:'Войти в бар',path:'/bar'});}
 if(selected==='chat'){description='Новости и события игроков';}
 if(selected==='bonus'){description=bonus;actions.push({label:'Выбрать игру',path:'/bonus-games'});}
 if(selected==='gym')description='Физическая подготовка · в разработке';
 if(selected==='fame')description='Лучшие игроки и результаты · в разработке';
 if(selected==='pro')description=level==='professional'?`${daily} · Игры самого высокого уровня · в разработке`:'Игры самого высокого уровня · в разработке';
 if(selected==='pro'&&level==='professional')actions.push({label:'Войти на арену',path:'/daily'});
 const badge=(id:string)=>{
  const count=id==='chat'?props.chatCount:id==='stadium'?props.gameCount:id==='tasks'?props.taskCount:id==='bar'?props.barCount:0;
  const label=id==='chat'?'Непрочитанные':id==='stadium'?'Дуэли и турниры':id==='tasks'?'Задания и челленджи':'Приглашения в бар';
  return (count??0)>0?<small className="district-badge" aria-label={`${label}: ${count}`}>{count!>99?'99+':count}</small>:null;
 };
 return <section ref={district} className={`district${props.city?' district--weather':''}`} aria-label="Хоккейный район">
  <div ref={viewport} className="district-viewport" tabIndex={0} aria-label="Карта района"
   onPointerDown={e=>{if(!e.isPrimary||e.button!==0)return;blockUntil.current=0;drag.current={x:e.clientX,y:e.clientY,left:e.currentTarget.scrollLeft,type:e.pointerType,moved:false};e.currentTarget.scrollTo?.({left:e.currentTarget.scrollLeft,behavior:'instant' as ScrollBehavior});}}
   onPointerMove={e=>{const d=drag.current;if(!d)return;if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>8)d.moved=true;if(d.moved&&d.type==='mouse'){e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.scrollLeft=d.left+d.x-e.clientX;}}}
   onPointerUp={()=>{if(drag.current?.moved)blockUntil.current=performance.now()+500;drag.current=null;}}
   onPointerCancel={()=>{blockUntil.current=performance.now()+500;drag.current=null;}}
   onClickCapture={e=>{if(e.detail!==0&&(drag.current?.moved||performance.now()<blockUntil.current)){e.preventDefault();e.stopPropagation();}}}>
   <div ref={world} className="district-world">{props.city&&<CityWeatherWidget cityName={props.city.name} weather={props.currentWeather} stale={props.weatherStale??false} loading={props.weatherLoading??false} night={image.includes('city-night-')}/>}<CityBackground image={image}/><StudioCityMotion phase={image.includes('city-night-')?'night':image.includes('city-sunset-')?'sunset':image.includes('city-morning-')?'morning':'day'} owner={owner} flood={!props.maintenanceBlocked&&(props.caretakerPreview??caretaker)==='flood'}/>{!props.maintenanceBlocked&&(props.caretakerPreview??caretaker)==='scrape'&&<CityCaretaker kind={(props.caretakerPreview??caretaker)!} venue={dailyId as 'yard'|'stadium'|'pro'}/> }
    {places.map(p=><button key={p.id} aria-label={`На карте: ${p.name}`} className={`district-hit${p.id==='profile'?' district-apartment':p.id==='locker'?' district-locker':''}${flash===p.id?' is-flashing':''}`} style={{zIndex:p.id==='pro'?1:2,left:`${p.x}%`,top:`${p.y}%`,width:p.id==='locker'?44:`${p.w}%`,height:p.id==='locker'?44:`${p.h}%`}} onClick={()=>openBuilding(p)}>{p.id==='locker'&&<Shirt size={22} aria-hidden="true"/>}</button>)}
    {/* Keep the glass on the map layer: nested transformed buttons can prevent backdrop sampling. */}
    <span className="district-apartment-avatar" aria-hidden="true" style={{left:`${apartment.x}%`,top:`${apartment.y-apartment.h*.1}%`}}><User/></span>
   </div>
  </div>
    {props.gamePanel&&<div className="district-game-anchor" data-venue={dailyId} onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}>{props.gamePanel}</div>}
  <WeatherOverlay key={props.weatherOverride??weather} weather={props.weatherOverride??weather}/>
  <section ref={panel} className={`district-panel${navigationCollapsed?' district-panel--collapsed navigation-collapsed-surface':''}`} aria-label="Выбранное место">
   <button type="button" className="icon-btn district-navigation-toggle" aria-label={navigationCollapsed?'Показать навигацию':'Свернуть навигацию'} title={navigationCollapsed?'Показать навигацию':'Свернуть навигацию'} aria-expanded={!navigationCollapsed} onClick={toggleNavigation}>{navigationCollapsed?<MapIcon aria-hidden="true"/>:<span className="district-navigation-handle" aria-hidden="true"/>}{navigationCollapsed&&navigationCount>0&&<small className="district-badge" aria-label={`Уведомления: ${navigationCount}`}>{navigationCount>99?'99+':navigationCount}</small>}{navigationCollapsed&&props.gameStatus?.label&&<em className="district-game-status" aria-label={`Статус игр: ${props.gameStatus.label}`}>{props.gameStatus.label}</em>}</button>
   {!navigationCollapsed&&<><div className="district-identity"><div><h1>{place.name}</h1><p>{description}{selected==='tasks'&&props.attention&&<span aria-label="Требуется действие"> · Есть награда</span>}</p></div><div className="district-actions">{actions.map(a=><button className="icon-btn" key={a.label} aria-label={a.label} title={a.label} onClick={()=>onNavigate(entryRoute(selected,a.path))}>{<ChevronRight/>}</button>)}</div></div>
   <nav className="district-dock" ref={dock} {...dockPan} aria-label="Места района"><button aria-label="Открыть профиль" aria-pressed={selected==='profile'} title="Мой профиль" onClick={()=>openBuilding(places[0]!)}><span className="district-profile">{props.avatarUrl?<img src={props.avatarUrl} alt=""/>:<User aria-hidden="true"/>}</span><small className="district-dock__label">Профиль</small>{(props.referralCount??0)>0&&<small className="district-badge" aria-label={`Награды за приглашения: ${props.referralCount}`}>{props.referralCount!>99?'99+':props.referralCount}</small>}</button>{places.filter(p=>p.id!=='profile'&&p.id!=='chat').map(p=><Fragment key={p.id}><button aria-label={`Выбрать ${p.name}`} title={p.name} aria-pressed={selected===p.id} onClick={()=>openBuilding(p)}><LocationIcon id={p.id}/><small className="district-dock__label">{p.id==='yard'?'Двор':p.id==='stadium'?'Стадион':p.id==='pro'?'Арена':p.id==='bar'?'Бар':p.name}</small>{badge(p.id)}{p.id===dailyId&&props.gameStatus?.label&&<em className="district-game-status" aria-label={`Статус игр: ${props.gameStatus.label}`}>{props.gameStatus.label}</em>}</button>{p.id==='tasks'&&(<button aria-label="Открыть ленту" title="Лента" onClick={()=>{rememberChatReturn(owner,'/sections');onNavigate('/chat?view=feed');}}><LocationIcon id="feed"/><small className="district-dock__label">Лента</small></button>)}</Fragment>)}{props.isAdmin&&<button aria-label="Открыть админку" title="Админ" onClick={()=>onNavigate('/admin')}><span className="district-profile district-admin"><ShieldCheck size={18} strokeWidth={1.5} aria-hidden="true"/></span><small className="district-dock__label">Админ</small>{(props.adminCount??0)>0&&<small className="district-badge" aria-label={`События администратора: ${props.adminCount}`}>{props.adminCount!>99?'99+':props.adminCount}</small>}</button>}</nav></>}
  </section>
 </section>;
}
