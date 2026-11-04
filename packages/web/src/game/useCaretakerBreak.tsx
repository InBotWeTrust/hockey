import {CaretakerResultModal,type CaretakerResult} from './CaretakerResultModal.js';
import {caretakerEquipment} from './caretakerEquipment.js';
import {useEffect,useRef,useState} from 'react';
import {startDrift,type DriftSession} from '../api/drift.js';
import type {DailyStateResponse} from '../api/duel.js';
import './caretaker.css';
import {DriftGame} from './DriftGame.js';
export function useCaretakerBreak(data:DailyStateResponse,suppressed:boolean,refresh:()=>unknown,owner?:string,venue:"yard"|"stadium"="yard"){
 const equipment=caretakerEquipment(venue,data.daily_seed ?? `${owner}:${data.day_date}`,data.current_period);
 const [game,setGame]=useState<DriftSession|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const key=`${owner}:${data.day_date}:${data.current_period}`,current=useRef(key);current.current=key;
 const [result,setResult]=useState<(CaretakerResult & {key:string})|null>(null);
 const [completedKey,setCompletedKey]=useState<string|null>(null);
 const completionStorageKey=`caretaker-completed:${key}`;
 let savedCompletion=false;try{savedCompletion=localStorage.getItem(completionStorageKey)==='1';}catch{/* Storage may be unavailable; keep the in-memory completion flag. */}
 const completed=completedKey===key||savedCompletion;
 const request=useRef<string|null>(null),lock=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{setGame(null);setResult(null);setError('');request.current=null;},[key]);
 useEffect(()=>{if(data.state!=='break_active')setGame(null);},[data.state]);
 async function open(){if(completed||lock.current||game||suppressed||data.state!=='break_active')return;lock.current=true;setLoading(true);const openedKey=key;request.current??=crypto.randomUUID();try{const value=await startDrift(request.current);if(mounted.current&&current.current===openedKey){setGame(value);setError('');}}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Не удалось начать уборку.');}finally{lock.current=false;if(mounted.current)setLoading(false);}}
 const exit=()=>{setGame(null);request.current=null;void refresh();};
 return {equipment,completed,active:game!==null,onTap:!completed&&data.state==='break_active'&&!suppressed&&!game?()=>void open():undefined,overlay:result&&result.key===key?<CaretakerResultModal result={result} onClose={()=>setResult(null)}/>:game?<DriftGame venue={venue} equipment={equipment} key={game.attemptId} initial={game} onExit={exit} onComplete={value=>{if(!value.completed||current.current!==key)return;
 setResult({key,savedMs:Math.max(0,Date.parse(game.readyAt)-Date.parse(value.readyAt)),remainingMs:Math.max(0,Date.parse(value.readyAt)-Date.parse(value.serverNow))});
 setGame(null);setCompletedKey(key);try{localStorage.setItem(completionStorageKey,'1');}catch{/* Storage may be unavailable; keep the in-memory completion flag. */}void refresh();}}/>:error?<div className="caretaker-hint" style={{pointerEvents:'auto'}}><p role="alert">{error}</p><button className="btn btn--ghost" disabled={loading} onClick={()=>void open()}>Повторить</button><button className="btn btn--ghost" onClick={()=>setError('')}>Закрыть</button></div>:null,invitation:data.state==='break_active'&&!suppressed&&!completed&&!game?<span>Нажми на Григория – помоги<br/>{' '}{equipment==='machine'?'залить':'убрать'} лёд и сократи перерыв.</span>:null};
}
