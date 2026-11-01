import {WindowHandleHint,FloatingShortcutsHint} from '../components/WindowHandleHint.js';
import {useGameMenu} from './GameMenuContext.js';
import {MapGameActions} from './MapGameActions.js';
import {useGameWindowPosition} from './useGameWindowPosition.js';
import {CityGameDetails} from './CityGamePanel.js';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useLocation} from 'react-router-dom';
import {Monitor,X} from 'lucide-react';
import {createPortal} from 'react-dom';
import {FloatingShortcut} from '../components/FloatingShortcut.js';
import {isOpenRinkRoute} from '../components/BottomNav.js';
import {useChatOverlayOpen} from '../chat/ChatOverlayContext.js';
import type {ArenaEntry} from '../screens/DailyScreen.js';
import {gameNotifications,viewedGameIds} from './gameNotifications.js';
import './floating-games.css';
export function FloatingGamePanel({owner,entries,activeIndex,onActiveIndexChange,renderFace,renderActions,openRequest=0}:{owner?:string|undefined;entries:ArenaEntry[];activeIndex:number;onActiveIndexChange:(index:number)=>void;renderFace:(entry:ArenaEntry)=>ReactNode;renderActions:(entry:ArenaEntry)=>ReactNode;openRequest?:number}):JSX.Element {
 const [open,setOpen]=useState(false);const location=useLocation(),chatOpen=useChatOverlayOpen();
 const {mapHost,guideActive}=useGameMenu();
 const onMap=location.pathname==='/sections';
 const [mapEntryId,setMapEntryId]=useState<string|null>(null);
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{if(!onMap)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[onMap]);
 useEffect(()=>{if(onMap&&guideActive)setOpen(false);},[onMap,guideActive]);
 const shownEntries=entries;
 const shownIndex=onMap?Math.max(0,shownEntries.findIndex(e=>e.id===mapEntryId)):activeIndex;
 const changeIndex=(index:number)=>{if(onMap)setMapEntryId(shownEntries[index]?.id??null);else onActiveIndexChange(index);};
 const {handleProps,cardStyle}=useGameWindowPosition(owner,open&&!chatOpen);
 const minimizedButton=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(open&&!chatOpen)minimizedButton.current?.focus({preventScroll:true});},[open,chatOpen]);
 const handledOpen=useRef(openRequest);
 const lastRoute=useRef(location.pathname+location.search);
 const notices=gameNotifications(entries,viewedGameIds(entries,location.pathname,location.search)),active=shownEntries[shownIndex]??shownEntries[0];
 const show=()=>{if(notices.firstIndex!==null)onActiveIndexChange(notices.firstIndex);setOpen(true);};
 useEffect(()=>{if(openRequest!==handledOpen.current){handledOpen.current=openRequest;setOpen(true);}},[openRequest]);
 useEffect(()=>{const route=location.pathname+location.search;if(lastRoute.current!==route){lastRoute.current=route;setOpen(false);}},[location.pathname,location.search]);
 const playing=isOpenRinkRoute(location)||location.pathname.startsWith('/duel/');
 const allowed=!(onMap&&guideActive)&&!/^\/(?:login|auth|mobile-auth)(?:\/|$)/.test(location.pathname)&&!chatOpen;
 return <>
  <FloatingShortcutsHint owner={owner} visible={allowed&&!open&&!onMap&&!guideActive}/>
  <FloatingShortcut owner={owner} storagePrefix="floating-games-position-v1" side="left" initialTop={80} visible={allowed&&!open&&!onMap} playing={playing} label="Открыть игры" count={notices.count} badgeLabel="Незавершённых игр" neutralBadge={!notices.urgent} pulseBadge={notices.pulsing} className="floating-games" icon={<Monitor aria-hidden="true"/>} onOpen={show}/>
  {onMap&&mapHost&&!chatOpen&&createPortal(<MapGameActions entries={entries} now={now} onOpen={(_id,firstId)=>{setMapEntryId(firstId);setOpen(true);}}/>,mapHost)}
  {open&&active&&allowed&&createPortal(
   <div className="floating-games-layer" style={{alignItems:'center'}}>
    <section role="dialog" aria-modal="false" aria-label="Игры" className="city-game-panel glass is-expanded floating-games-window" style={cardStyle} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setOpen(false);}}}>
     <button {...handleProps} type="button" className="floating-games-window__handle" aria-label="Переместить окно игр"><span aria-hidden="true"/></button>
     <div className="floating-games-window__header"><button ref={minimizedButton} type="button" className="icon-btn" aria-label="Закрыть игры" onClick={()=>setOpen(false)}><X size={18}/></button></div>
     <CityGameDetails entries={shownEntries} activeIndex={shownIndex} onActiveIndexChange={changeIndex} renderFace={renderFace} renderActions={renderActions}/>
    </section>
    <WindowHandleHint owner={owner} kind="games" anchorRef={minimizedButton}/>
   </div>,document.body)}
 </>;
}
