import {useGameMenu} from './GameMenuContext.js';
import {lazy,Suspense,useEffect} from 'react';
import {useNavigate} from 'react-router-dom';
import {useDailyStore} from '../stores/dailyStore.js';
const Hub=lazy(()=>import('../screens/DailyScreen.js').then(m=>({default:m.GameHub})));
export function GlobalGames():JSX.Element|null {
 const {setStatus}=useGameMenu();
 const data=useDailyStore(s=>s.data),navigate=useNavigate();
 useEffect(()=>{const s=useDailyStore.getState();if(!s.data&&!s.loading&&!s.inFlight)void s.refresh();},[]);
 if(!data)return null;
 return <Suspense fallback={null}><Hub presentation="floating" onDockStatusChange={setStatus} onOpenDailyPlay={()=>navigate('/?view=daily')} onOpenTraining={()=>navigate('/?view=training')} onOpenTrainingPlay={()=>navigate('/?view=training&play=1')} onOpenAmateurMatch={id=>navigate(`/?view=amateur&match=${encodeURIComponent(id)}&play=1`)}/></Suspense>;
}
