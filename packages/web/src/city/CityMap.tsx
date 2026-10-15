import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ChevronRight,Snowflake,Goal} from 'lucide-react';
import './city-map.css';
type Level='beginner'|'amateur'|'professional';
type Props={owner?:string|undefined;level:Level;daily:string;training:string;tasks:string;bonus:string;attention?:boolean;onNavigate:(path:string)=>void};
const places=[
 {id:'yard',name:'Дворовый каток',x:13,y:57,w:20,h:18},
 {id:'shop',name:'Магазин',x:19,y:40,w:8,h:13,thumb:[16.8,33.8]},
 {id:'bank',name:'Банк',x:28,y:39,w:8,h:14,thumb:[26.2,33.8]},
 {id:'tasks',name:'Задания',x:30,y:60,w:9,h:14},
 {id:'stadium',name:'Стадион «Центральный»',x:41,y:43,w:15,h:18},
 {id:'gym',name:'Спортзал',x:45,y:25,w:11,h:12},
 {id:'bar',name:'Бар "4-й период"',x:50,y:55,w:11,h:15},
 {id:'fame',name:'Зал славы',x:61,y:33,w:14,h:19},
 {id:'bonus',name:'Бонусные игры',x:64,y:55,w:13,h:19},
 {id:'pro',name:'Арена Ультимейт',x:87,y:31,w:24,h:36},
];
export function CityMap(props:Props){
 const {owner,level,daily,training,tasks,bonus,onNavigate}=props;
 const dailyId={beginner:'yard',amateur:'stadium',professional:'pro'}[level];
 const storageKey=`city-place-v2:${owner??'anonymous'}:${level}`;
 const [selected,setSelected]=useState(()=>{try{const stored=sessionStorage.getItem(storageKey);return places.some(p=>p.id===stored)?stored!:dailyId;}catch{return dailyId;}});
 const [flash,setFlash]=useState<string|null>(null);
 const viewport=useRef<HTMLDivElement>(null),world=useRef<HTMLDivElement>(null),dock=useRef<HTMLElement>(null);
 const timer=useRef<ReturnType<typeof setTimeout>>();
 const drag=useRef<{x:number;y:number;left:number;type:string;moved:boolean}|null>(null);
 const blockUntil=useRef(0);
 const positioned=useRef(false);
 const currentPlace=useRef(selected);currentPlace.current=selected;
 const place=places.find(p=>p.id===selected)!;
 const image=window.devicePixelRatio>1.5?'/maps/city-6144-950ff27a3699.webp':'/maps/city-4096-ff03b6a9e3f4.webp';
 const select=(id:string)=>{setSelected(id);try{sessionStorage.setItem(storageKey,id);}catch{/* Optional selection persistence. */}clearTimeout(timer.current);setFlash(null);if(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)timer.current=setTimeout(()=>setFlash(id),280);};
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 useLayoutEffect(()=>{const el=viewport.current,w=world.current;if(!el||!w)return;const behavior=positioned.current&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'smooth':'auto';el.scrollTo?.({left:w.clientWidth*place.x/100-el.clientWidth/2,behavior});const active=dock.current?.querySelector<HTMLElement>('[aria-pressed="true"]');if(active&&dock.current)dock.current.scrollTo?.({left:active.offsetLeft-dock.current.offsetLeft-dock.current.clientWidth/2+23,behavior});positioned.current=true;},[place]);
 useEffect(()=>{const el=viewport.current,w=world.current;if(!el||!w||typeof ResizeObserver==='undefined')return;let width=el.clientWidth,height=el.clientHeight;const observer=new ResizeObserver(()=>{if(width===el.clientWidth&&height===el.clientHeight)return;width=el.clientWidth;height=el.clientHeight;const current=places.find(p=>p.id===currentPlace.current)!;el.scrollTo?.({left:w.clientWidth*current.x/100-width/2,behavior:'auto'});});observer.observe(el);return()=>observer.disconnect();},[]);

 let description='';const actions:{label:string;path:string;kind?:string}[]=[];
 if(selected==='yard'){description=level==='beginner'?`${daily} · Тренировка: ${training}`:'Открытая тренировка и упражнения';actions.push({label:'Тренировка',path:'/?view=training&from=sections',kind:'training'});}
 if(selected==='stadium'){description=level==='amateur'?daily:'Дуэли и турниры';actions.push({label:'Дуэли и турниры',path:'/?view=amateur&from=sections'});}
 if(selected==='tasks'){description=tasks;actions.push({label:'Открыть задания',path:'/achievements'});}
 if(selected==='shop'){description='Инвентарь и валюта';actions.push({label:'Войти в магазин',path:'/inventory'});}
 if(selected==='bank'){description='Валюта и пополнение';actions.push({label:'Открыть банк',path:'/inventory?tab=bank'});}
 if(selected==='bar'){description='Трансляции, игры и общение';actions.push({label:'Войти в бар',path:'/bar'});}
 if(selected==='bonus'){description=bonus;actions.push({label:'Выбрать игру',path:'/bonus-games'});}
 if(selected==='gym')description='Физическая подготовка · в разработке';
 if(selected==='fame')description='Лучшие игроки и результаты · в разработке';
 if(selected==='pro')description=level==='professional'?`${daily} · Игры самого высокого уровня · в разработке`:'Игры самого высокого уровня · в разработке';
 if(selected===dailyId)actions.push({label:'Ежедневная игра',path:'/daily',kind:'daily'});
 return <section className="district" aria-label="Хоккейный район">
  <div ref={viewport} className="district-viewport" tabIndex={0} aria-label="Карта района"
   onPointerDown={e=>{if(!e.isPrimary||e.button!==0)return;blockUntil.current=0;drag.current={x:e.clientX,y:e.clientY,left:e.currentTarget.scrollLeft,type:e.pointerType,moved:false};e.currentTarget.scrollTo?.({left:e.currentTarget.scrollLeft,behavior:'instant' as ScrollBehavior});}}
   onPointerMove={e=>{const d=drag.current;if(!d)return;if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>8)d.moved=true;if(d.moved&&d.type==='mouse'){e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.scrollLeft=d.left+d.x-e.clientX;}}}
   onPointerUp={()=>{if(drag.current?.moved)blockUntil.current=performance.now()+500;drag.current=null;}}
   onPointerCancel={()=>{blockUntil.current=performance.now()+500;drag.current=null;}}
   onClickCapture={e=>{if(e.detail!==0&&(drag.current?.moved||performance.now()<blockUntil.current)){e.preventDefault();e.stopPropagation();}}}>
   <div ref={world} className="district-world"><img src={image} alt="Зимний хоккейный район" draggable={false} decoding="async"/>
    {places.map(p=><button key={p.id} aria-label={`На карте: ${p.name}`} className={`district-hit${flash===p.id?' is-flashing':''}`} style={{left:`${p.x}%`,top:`${p.y}%`,width:`${p.w}%`,height:`${p.h}%`}} onClick={()=>select(p.id)}/>)}
   </div>
  </div>
  <section className="district-panel" aria-label="Выбранное место"><div className="district-identity"><div><h1>{place.name}</h1><p>{description}{selected==='tasks'&&props.attention&&<span aria-label="Требуется действие"> · Есть награда</span>}</p></div><div className="district-actions">{actions.map(a=><button className="icon-btn" key={a.label} aria-label={a.label} title={a.label} onClick={()=>onNavigate(a.path)}>{a.kind==='training'?<Snowflake/>:a.kind==='daily'?<Goal/>:<ChevronRight/>}</button>)}</div></div>
   <nav className="district-dock" ref={dock} aria-label="Места района">{places.map(p=><button key={p.id} aria-label={`Выбрать ${p.name}`} title={p.name} aria-pressed={selected===p.id} onClick={()=>select(p.id)}><span style={{backgroundImage:`url(${image})`,backgroundPosition:`${p.thumb?.[0]??p.x}% ${p.thumb?.[1]??p.y}%`}}/></button>)}</nav>
  </section>
 </section>;
}
