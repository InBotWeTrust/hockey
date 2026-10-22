import {useGameWindowPosition} from './useGameWindowPosition.js';
import {CityGameDetails} from './CityGamePanel.js';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useLocation} from 'react-router-dom';
import {Box,Minimize2} from 'lucide-react';
import {AccessibleModal} from '../components/AccessibleModal.js';
import {FloatingShortcut} from '../components/FloatingShortcut.js';
import {isOpenRinkRoute} from '../components/BottomNav.js';
import {useChatOverlayOpen} from '../chat/ChatOverlayContext.js';
import type {ArenaEntry} from '../screens/DailyScreen.js';
import {gameNotifications} from './gameNotifications.js';
import './floating-games.css';
export function FloatingGamePanel({owner,entries,activeIndex,onActiveIndexChange,renderFace,renderActions,openRequest=0}:{owner?:string|undefined;entries:ArenaEntry[];activeIndex:number;onActiveIndexChange:(index:number)=>void;renderFace:(entry:ArenaEntry)=>ReactNode;renderActions:(entry:ArenaEntry)=>ReactNode;openRequest?:number}):JSX.Element {
 const [open,setOpen]=useState(false);const location=useLocation(),chatOpen=useChatOverlayOpen();
 const {handleProps,cardStyle}=useGameWindowPosition(owner,open);
 const minimizedButton=useRef<HTMLButtonElement>(null);
 const handledOpen=useRef(openRequest);
 const lastRoute=useRef(location.pathname+location.search);
 const notices=gameNotifications(entries),active=entries[activeIndex]??entries[0];
 const show=()=>{if(notices.firstIndex!==null)onActiveIndexChange(notices.firstIndex);setOpen(true);};
 useEffect(()=>{if(openRequest!==handledOpen.current){handledOpen.current=openRequest;setOpen(true);}},[openRequest]);
 useEffect(()=>{const route=location.pathname+location.search;if(lastRoute.current!==route){lastRoute.current=route;setOpen(false);}},[location.pathname,location.search]);
 const playing=isOpenRinkRoute(location)||location.pathname.startsWith('/duel/');
 const allowed=!/^\/(?:login|auth|mobile-auth)(?:\/|$)/.test(location.pathname)&&!chatOpen;
 return <>
  <FloatingShortcut owner={owner} storagePrefix="floating-games-position-v1" side="left" initialTop={80} visible={allowed&&!open} playing={playing} label="Открыть игры" count={notices.count} badgeLabel="Незавершённых игр" neutralBadge={!notices.urgent} className="floating-games" icon={<Box aria-hidden="true"/>} onOpen={show}/>
  {open&&active&&<AccessibleModal cardStyle={cardStyle} beforeHeader={<button {...handleProps} type="button" className="floating-games-window__handle" aria-label="Переместить окно игр"><span aria-hidden="true"/></button>} backdropStyle={{alignItems:'center'}} title="" ariaLabel="Игры" cardClassName="city-game-panel glass is-expanded floating-games-window" onClose={()=>setOpen(false)} initialFocusRef={minimizedButton}
   headerAction={<button ref={minimizedButton} type="button" className="icon-btn" aria-label="Свернуть игры" onClick={()=>setOpen(false)}><Minimize2 size={18}/></button>}>
   <CityGameDetails entries={entries} activeIndex={activeIndex} onActiveIndexChange={onActiveIndexChange} renderFace={renderFace} renderActions={renderActions}/>
  </AccessibleModal>}
 </>;
}
