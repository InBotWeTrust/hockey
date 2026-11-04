import {useEffect,useRef,useState} from 'react';
import {AccessibleModal} from '../components/AccessibleModal.js';
export interface CaretakerResult {
  savedMs: number;
  remainingMs: number;
}
function duration(ms:number):string {
 const seconds=Math.max(0,Math.round(ms/1000)),minutes=Math.floor(seconds/60),rest=seconds%60;
 return [minutes?`${minutes} мин`:'',rest?`${rest} сек`:''].filter(Boolean).join(' ')||'0 сек';
}
export function CaretakerResultModal({result,onClose}:{result:CaretakerResult;onClose:()=>void}){
 const opened=useRef(performance.now());
 const [remaining,setRemaining]=useState(result.remainingMs);
 useEffect(()=>{const timer=window.setInterval(()=>setRemaining(Math.max(0,result.remainingMs-(performance.now()-opened.current))),250);return()=>clearInterval(timer);},[result.remainingMs]);
 const ended=remaining<=0;
 const seconds=Math.ceil(remaining/1000);
 return <AccessibleModal title="Лёд готов!" onClose={onClose}>
  <p className="modal-copy">Перерыв сокращён на:<br/><strong className="daily-result-follow-up__timer" style={{color:'var(--green-deep)'}}>{duration(result.savedMs)}</strong></p>
  <p className="modal-copy" style={{marginTop:16}}>Ты помог Григорию подготовить площадку.{ended?' Можно начинать следующий период.':''}</p>
  {!ended&&<p className="modal-copy" style={{marginTop:12}}>До следующего периода: <strong className="daily-result-follow-up__timer">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</strong></p>}
  <div className="modal-actions"><button type="button" className="modal-primary btn--cta" onClick={onClose}>{ended?'На лёд':'Отлично'}</button></div>
 </AccessibleModal>;
}
