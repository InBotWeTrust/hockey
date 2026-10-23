import {useLocation,useNavigate} from 'react-router-dom';
import {MessageCircle} from 'lucide-react';
import {isOpenRinkRoute} from './BottomNav.js';
import {useMapChatPosition} from '../app/mapChatPosition.js';
import {chatResumeRoute} from '../chat/chatResume.js';
import {rememberChatReturn} from '../chat/chatReturn.js';
import {useChatOverlayOpen} from '../chat/ChatOverlayContext.js';
import {FloatingShortcut} from './FloatingShortcut.js';
export function isChatShortcutVisible(location:{pathname:string;search:string}):boolean {
 return !/^\/(?:chat|login|auth|mobile-auth)(?:\/|$)/.test(location.pathname);
}
export function FloatingChatShortcut({owner,unreadCount}:{owner?:string;unreadCount:number}):JSX.Element {
 const location=useLocation(),navigate=useNavigate(),side=useMapChatPosition(owner),overlayOpen=useChatOverlayOpen();
 return <FloatingShortcut owner={owner} storagePrefix="floating-chat-position-v2" className={`floating-chat${isOpenRinkRoute(location)||location.pathname.startsWith('/duel/')?' floating-chat--playing':''}`} label="Открыть чат" badgeLabel="Непрочитанные" count={unreadCount} side={side} visible={isChatShortcutVisible(location)&&!overlayOpen} playing={isOpenRinkRoute(location)||location.pathname.startsWith('/duel/')} icon={<MessageCircle aria-hidden="true"/>} onOpen={()=>{rememberChatReturn(owner,location.pathname+location.search+location.hash);navigate(chatResumeRoute(owner));}}/>;
}
