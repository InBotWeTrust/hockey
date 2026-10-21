import {useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {MessageCircle} from 'lucide-react';
import {isOpenRinkRoute} from './BottomNav.js';
import {useMapChatPosition} from '../app/mapChatPosition.js';
import {rememberChatReturn} from '../chat/chatReturn.js';
import './navigation-geometry.css';
import './floating-chat.css';

export function isChatShortcutVisible(location:{pathname:string;search:string}):boolean {
 return !/^\/chat(?:\/|$)/.test(location.pathname) && !isOpenRinkRoute(location)
   && !location.pathname.startsWith('/duel/') && !['/demo','/test-court','/dev/daily-period-preview'].includes(location.pathname);
}
export function FloatingChatShortcut({owner,unreadCount}:{owner?:string;unreadCount:number}):JSX.Element|null {
 const location=useLocation(),navigate=useNavigate();
 const side=useMapChatPosition(owner);
 const visible=isChatShortcutVisible(location);
 const button=useRef<HTMLButtonElement>(null);
 const [placement,setPlacement]=useState<{top?:number;left?:number;collapsed:boolean}>({collapsed:false});
 useLayoutEffect(()=>{
  if(!visible)return;
  const root=button.current?.closest<HTMLElement>('.app-shell');
  if(!root)return;
  let resize:ResizeObserver|undefined;
  const update=()=>{
   const bounds=root.getBoundingClientRect();
   const menu=Array.from(root.querySelectorAll<HTMLElement>('.district-panel,.section-scene__panel,.bar-bottom-chrome')).find(el=>el.getBoundingClientRect().height>0&&!el.hidden);
   const rect=menu?.getBoundingClientRect();
   const collapsed=menu?.classList.contains('district-panel--collapsed')??false;
   const next:{top?:number;left?:number;collapsed:boolean}=rect?{top:Math.max(12,rect.top-bounds.top-(collapsed?0:68)),...(collapsed?{left:rect.right-bounds.left+12}:{}),collapsed}:{collapsed:false};
   setPlacement(old=>old.top===next.top&&old.left===next.left&&old.collapsed===next.collapsed?old:next);
  };
  const observe=()=>{resize?.disconnect();resize=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(update);resize?.observe(root);root.querySelectorAll('.district-panel,.section-scene__panel,.bar-bottom-chrome').forEach(el=>resize?.observe(el));update();};
  observe();
  const mutations=new MutationObserver(observe);mutations.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden']});
  window.addEventListener('resize',update);
  return()=>{resize?.disconnect();mutations.disconnect();window.removeEventListener('resize',update);};
 },[visible,location.pathname,location.search]);
 if(!visible)return null;
 const style:CSSProperties={...(placement.top===undefined?{}:{top:placement.top,bottom:'auto'}),...(placement.left===undefined?{}:{left:placement.left,right:'auto'})};
 return <button ref={button} type="button" className={`icon-btn floating-chat${placement.collapsed?' floating-chat--collapsed navigation-collapsed-surface':''}`} data-side={side} aria-label="Открыть чат" title="Чат" style={style} onClick={()=>{rememberChatReturn(owner,location.pathname+location.search+location.hash);navigate('/chat');}}>
  <MessageCircle aria-hidden="true"/>{unreadCount>0&&<small className="floating-chat__badge" aria-label={`Непрочитанные: ${unreadCount}`}>{unreadCount>99?'99+':unreadCount}</small>}
 </button>;
}
