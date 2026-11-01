import {useEffect,useRef,useState,type PointerEvent} from 'react';
import {actCaretaker,type CaretakerInput,type CaretakerState} from '../api/caretaker.js';
import './caretaker.css';
const titles={push:'Поддай ходу!',trail:'Чистая дорожка',piles:'Сугробы',turn:'Ловкий разворот',throw:'Снег за борт!'};
const instructions={push:'Проводи вверх или вниз по стрелке – помоги очистить 5 полос.',trail:'Веди Григория по дорожке к голубой отметке. Очисти все три дорожки.',piles:'Удерживай подсвеченный сугроб, чтобы убрать снег. Всего их шесть.',turn:'Нажимай на лёд, когда отметка станет голубой. Нужно пять разворотов.',throw:'Проведи в сторону стрелки. Подбери силу по голубой шкале – выброси пять порций снега.'};
export function CaretakerGame({initial,onExit,onComplete,send=actCaretaker}:{initial:CaretakerState;onExit:()=>void;onComplete:()=>void;send?:typeof actCaretaker}){
 const [state,setState]=useState(initial),[error,setError]=useState(''),[pending,setPending]=useState(false),[now,setNow]=useState(Date.now()),[power,setPower]=useState(0);
 const live=useRef(state);live.current=state;const mounted=useRef(true),busy=useRef(false),retry=useRef<{seq:number;input:CaretakerInput}|null>(null),pointer=useRef<{x:number;y:number;time:number}|null>(null),hold=useRef<ReturnType<typeof setInterval>|null>(null);
 const clock=useRef({server:Date.parse(initial.serverNow),local:Date.now()});
 const elapsed=now-clock.current.local+clock.current.server-Date.parse(state.startedAt),phase=(elapsed%5000)/5000;
 const clearHold=()=>{if(hold.current!==null)clearInterval(hold.current);hold.current=null;pointer.current=null;};
 useEffect(()=>{mounted.current=true;const tick=setInterval(()=>setNow(Date.now()),100);const hidden=()=>{if(document.hidden)clearHold();};document.addEventListener('visibilitychange',hidden);return()=>{mounted.current=false;clearInterval(tick);clearHold();document.removeEventListener('visibilitychange',hidden);};},[]);
 async function submit(input:CaretakerInput){if(busy.current||live.current.completed)return;busy.current=true;setPending(true);const command=retry.current??{seq:live.current.seq+1,input};retry.current=command;try{const next=await send(live.current.attemptId,command.seq,command.input);if(!mounted.current)return;retry.current=null;clock.current={server:Date.parse(next.serverNow),local:Date.now()};setState(next);setError('');if(next.completed){clearHold();onComplete();}}catch(e){if(mounted.current){clearHold();setError(e instanceof Error?e.message:'Не удалось сохранить уборку.');}}finally{busy.current=false;if(mounted.current)setPending(false);}}
 const point=(event:PointerEvent<HTMLDivElement>)=>{const r=event.currentTarget.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(event.clientY-r.top)/r.height))};};
 const lane=Math.min(2,Math.floor(state.progress/20)),step=state.progress%20,pile=Math.min(5,Math.floor(state.progress/4000));
 const x=state.kind==='push'?.2+Math.min(4,Math.floor(state.progress/4))*.15:state.kind==='trail'?.25+lane*.25:state.kind==='piles'?(pile%2===0?.25:.75):.5;
 const y=state.kind==='push'?(Math.floor(state.progress/4)%2===0?.85-(state.progress%4)*.175:.15+(state.progress%4)*.175):state.kind==='trail'?.1+step*.04:state.kind==='piles'?.25+Math.floor(pile/2)*.25:state.kind==='turn'?.15+phase*.7:.5;
 const down=(e:PointerEvent<HTMLDivElement>)=>{if(error||state.completed)return;e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);const p=point(e);pointer.current={...p,time:Date.now()};if(state.kind==='piles'){clearHold();pointer.current={...p,time:Date.now()};hold.current=setInterval(()=>{if(pointer.current&&!document.hidden)void submit({x:pointer.current.x,y:pointer.current.y,toX:pointer.current.x,toY:pointer.current.y,ms:500});},500);}if(state.kind==='turn')void submit({...p,toX:p.x,toY:p.y,ms:0});};
 const move=(e:PointerEvent<HTMLDivElement>)=>{const start=pointer.current;if(!start)return;const p=point(e);if(state.kind==='throw')setPower(Math.abs(p.x-start.x));if(state.kind==='piles'){pointer.current={...p,time:start.time};return;}if(state.kind==='trail'&&Date.now()-start.time>=350){void submit({x:start.x,y:start.y,toX:p.x,toY:p.y,ms:Math.min(10000,Date.now()-start.time)});pointer.current={...p,time:Date.now()};}};
 const up=(e:PointerEvent<HTMLDivElement>)=>{const start=pointer.current,p=point(e);clearHold();setPower(0);if(start&&(state.kind==='push'||state.kind==='throw'||state.kind==='trail'))void submit({x:start.x,y:start.y,toX:p.x,toY:p.y,ms:Math.min(10000,Date.now()-start.time)});};
 const remaining=Math.max(0,Date.parse(state.readyAt)-(now-clock.current.local+clock.current.server));
 return <section className="caretaker-game" aria-label={titles[state.kind]} onPointerDown={e=>e.stopPropagation()}>
  <header><strong>{titles[state.kind]}</strong><p>{state.completed?(remaining>0?`Лёд убран! Следующий период через ${Math.ceil(remaining/1000)} сек.`:'Лёд убран! Следующий период доступен.'):instructions[state.kind]}</p><progress aria-label="Уборка льда" value={state.progress} max={state.target}/></header>
  <div className="caretaker-field" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={clearHold}>
   {state.kind==='trail'&&[.25,.5,.75].map(n=><i key={n} className="caretaker-lane" style={{left:`${n*100}%`,background:`linear-gradient(to bottom, transparent ${Math.max(0,Math.min(100,(state.progress-((n-.25)/.25)*20)*5))}%, #ffffff80 0)`}}/>)}
   {state.kind==='piles'&&Array.from({length:6},(_,i)=><i key={i} className={`caretaker-pile ${i===pile?'is-target':''}`} style={{left:`${i%2===0?25:75}%`,top:`${25+Math.floor(i/2)*25}%`,opacity:i<pile?0:1}}/>)}
   <img draggable={false} className="caretaker-figure" src="/sprites/rink-caretaker-scrape.webp" alt="Григорий" style={{left:`${x*100}%`,top:`${y*100}%`}}/>
   {state.kind==='trail'&&<i className="caretaker-target" style={{left:`${x*100}%`,top:`${(y+.04)*100}%`}}/>}
   {state.kind==='push'&&<span className="caretaker-direction">{Math.floor(state.progress/4)%2===0?'↑':'↓'}</span>}
   {state.kind==='throw'&&<><span className="caretaker-direction">{state.progress%2===0?'→':'←'}</span><div className="caretaker-power"><span>{power>=.12&&power<=.45?'Отпускай!':'Проведи по стрелке'}</span><progress aria-label="Сила броска снега" value={power} max={.5}/></div></>}
   {state.kind==='turn'&&<span className={`caretaker-turn ${phase>=.82?'is-ready':''}`}>{phase>=.82?'Сейчас!':'Жди отметку'}</span>}
  </div>
  <footer>{error&&<><p role="alert">{error}</p><button className="btn btn--cta" disabled={pending} onClick={()=>retry.current&&void submit(retry.current.input)}>Повторить</button></>}<button className="btn btn--ghost" onClick={()=>{clearHold();onExit();}}>{state.completed?'Вернуться к игре':'Закончить позже'}</button></footer>
 </section>;
}
