import {useEffect,useRef,useState} from 'react';
import {caretakerHint} from '../api/caretaker.js';
import {startDrift,type DriftSession} from '../api/drift.js';
import type {DailyStateResponse} from '../api/duel.js';
import {DriftGame} from './DriftGame.js';
export function useCaretakerBreak(data:DailyStateResponse,suppressed:boolean,refresh:()=>unknown,owner?:string,venue:"yard"|"stadium"="yard"){
 const [game,setGame]=useState<DriftSession|null>(null),[hint,setHint]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const key=`${owner}:${data.day_date}:${data.current_period}`,current=useRef(key);current.current=key;
 const [completedKey,setCompletedKey]=useState<string|null>(null);
 const completionStorageKey=`caretaker-completed:${key}`;
 let savedCompletion=false;try{savedCompletion=localStorage.getItem(completionStorageKey)==='1';}catch{/* Storage may be unavailable; keep the in-memory completion flag. */}
 const completed=completedKey===key||savedCompletion;
 const request=useRef<string|null>(null),lock=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{setGame(null);setError('');request.current=null;},[key]);
 useEffect(()=>{if(data.state!=='break_active')setGame(null);},[data.state]);
 useEffect(()=>{let cancelled=false;if(data.state==='break_active'&&!suppressed)void caretakerHint().then(r=>{if(!cancelled)setHint(r.show);}).catch(()=>{});else setHint(false);return()=>{cancelled=true;};},[key,data.state,suppressed]);
 async function open(){if(completed||lock.current||game||suppressed||data.state!=='break_active')return;lock.current=true;setLoading(true);setHint(false);const openedKey=key;request.current??=crypto.randomUUID();try{const value=await startDrift(request.current);if(mounted.current&&current.current===openedKey){setGame(value);setError('');}}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Не удалось начать уборку.');}finally{lock.current=false;if(mounted.current)setLoading(false);}}
 const exit=()=>{setGame(null);request.current=null;void refresh();};
 return {completed,active:game!==null,onTap:!completed&&data.state==='break_active'&&!suppressed&&!game?()=>void open():undefined,overlay:game?<DriftGame venue={venue} key={game.attemptId} initial={game} onExit={exit} onComplete={()=>{setCompletedKey(key);try{localStorage.setItem(completionStorageKey,'1');}catch{/* Storage may be unavailable; keep the in-memory completion flag. */}setHint(false);void refresh();}}/>:error?<div className="caretaker-hint" style={{pointerEvents:'auto'}}><p role="alert">{error}</p><button className="btn btn--ghost" disabled={loading} onClick={()=>void open()}>Повторить</button><button className="btn btn--ghost" onClick={()=>setError('')}>Закрыть</button></div>:hint&&!completed?<div className="caretaker-hint">Нажми на Григория – помоги {venue==='stadium'?'залить':'убрать'} лёд и сократи перерыв.</div>:null};
}
