import { useEffect, useRef } from 'react';
export function LoadMoreOnScroll({hasMore,loading,error,load}:{hasMore:boolean;loading:boolean;error:boolean;load:()=>Promise<unknown>}):JSX.Element|null {
 const ref=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{const target=ref.current;if(!target||!hasMore||loading||error)return;
 const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))void load();},{rootMargin:'150px 0px'});
 observer.observe(target);return ()=>observer.disconnect();},[hasMore,loading,error,load]);
 return hasMore?<div ref={ref}>{loading?<p className="modal-copy">Загружаем ещё…</p>:error?<button className="btn btn--ghost" onClick={()=>void load()}>Повторить загрузку</button>:null}</div>:null;
}
