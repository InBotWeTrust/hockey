import {useEffect,useRef,useState} from 'react';
export function BarReopeningCountdown({until,onExpire}:{until:string;onExpire:()=>void}) {
 const [now,setNow]=useState(Date.now);
 const expire=useRef(onExpire);expire.current=onExpire;
 const deadline=Date.parse(until);
 useEffect(()=>{
  let notified=false;
  const tick=()=>{
   const current=Date.now();setNow(current);
   if(current>=deadline&&!notified){notified=true;expire.current();}
  };
  tick();
  const timer=setInterval(tick,1000);
  document.addEventListener('visibilitychange',tick);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick);};
 },[deadline]);
 const seconds=Math.max(0,Math.ceil((deadline-now)/1000));
 const duration=[Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(value=>String(value).padStart(2,'0')).join(':');
 return <p>Можно вернуться через <span role="timer" aria-label="До открытия бара" aria-live="off" style={{fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>{duration}</span></p>;
}
