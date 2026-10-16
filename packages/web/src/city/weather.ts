import {useEffect,useRef,useState} from 'react';

export const weatherKinds=['clear','snow','blizzard','fog','overcast'] as const;
export type WeatherKind=typeof weatherKinds[number];
export const weatherNames:Record<WeatherKind,string>={clear:'Ясно',snow:'Снегопад',blizzard:'Метель',fog:'Туман',overcast:'Пасмурно'};
const hour=3_600_000;
const storageKey='city-weather-v1';
type Schedule={weather:WeatherKind;until:number;blizzardAt:number};
const duration=(min:number,max:number,random:()=>number)=>(min+(max-min)*random())*hour;
function initial(now:number,random:()=>number):Schedule{
 return {weather:'clear',until:now+duration(24,72,random),blizzardAt:now+duration(120,240,random)};
}
function read(now:number,random:()=>number):Schedule{
 try{
  const value=JSON.parse(localStorage.getItem(storageKey)||'null') as Schedule|null;
  if(value&&weatherKinds.includes(value.weather)&&Number.isFinite(value.until)&&Number.isFinite(value.blizzardAt)&&value.until>0&&value.blizzardAt>=value.until&&value.until<=now+72*hour&&value.blizzardAt<=now+240*hour)return value;
 }catch{/* Storage may be unavailable in private browsing. */}
 return initial(now,random);
}
function advance(state:Schedule,random:()=>number):Schedule{
 const at=state.until;
 const due=state.blizzardAt;
 if(at>=due&&state.weather==='snow')return {weather:'blizzard',until:at+duration(3,8,random),blizzardAt:at+duration(120,240,random)};
 if(at>=due-6*hour&&at<due)return {weather:'snow',until:due,blizzardAt:due};
 if(at>=due-30*hour&&at<due-6*hour)return {weather:'overcast',until:due-6*hour,blizzardAt:due};
 let weather:WeatherKind;
 if(state.weather==='clear'||state.weather==='snow'||state.weather==='blizzard')weather='overcast';
 else if(state.weather==='fog')weather='clear';
 else{
  const choice=random();
  const morning=new Date(at).getHours();
  weather=choice<.65?'clear':choice<.85&&morning>=4&&morning<10?'fog':'snow';
 }
 const length=weather==='clear'||weather==='overcast'?duration(24,72,random):weather==='snow'?duration(6,18,random):duration(2,6,random);
 // Reserve overcast and snowfall before the planned blizzard.
 return {weather,until:Math.min(at+length,due-30*hour),blizzardAt:due};
}
function catchUp(state:Schedule,now:number,random:()=>number){
 // Bound work after a very long absence; start a fresh clear spell after one year.
 if(now-state.until>365*24*hour)return initial(now,random);
 while(state.until<=now)state=advance(state,random);
 return state;
}
export function useWeatherCycle(random:()=>number=Math.random){
 const schedule=useRef<Schedule|null>(null);
 if(!schedule.current)schedule.current=catchUp(read(Date.now(),random),Date.now(),random);
 const [weather,setWeather]=useState<WeatherKind>(schedule.current.weather);
 const [automatic,setAutomatic]=useState(true);
 const [cycle,setCycle]=useState(0);
 useEffect(()=>{
  if(!automatic)return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const update=()=>{
   clearTimeout(timer);
   const current=catchUp(schedule.current!,Date.now(),random);schedule.current=current;
   try{localStorage.setItem(storageKey,JSON.stringify(current));}catch{/* Keep working without persistence. */}
   setWeather(current.weather);
   if(!document.hidden)timer=setTimeout(update,Math.max(1,current.until-Date.now()));
  };
  const visibility=()=>{if(document.hidden)clearTimeout(timer);else update();};
  update();document.addEventListener('visibilitychange',visibility);
  return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);};
 },[automatic,cycle,random]);
 const selectWeather=(next:WeatherKind)=>{setAutomatic(false);setWeather(next);};
 const startAutomatic=()=>{setAutomatic(true);setCycle(value=>value+1);};
 return {weather,automatic,selectWeather,startAutomatic};
}
