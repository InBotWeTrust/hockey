import {Link,useInRouterContext} from 'react-router-dom';
import {LogOut} from 'lucide-react';
import {useAuthStore} from '../../auth/authStore.js';
import {chatReturnRoute} from '../chatReturn.js';
export function ChatExitLink({owner}:{owner?:string}):JSX.Element {
 const account=useAuthStore(state=>state.user?.id);
 const routed=useInRouterContext();
 const props={className:'chat-section-dock__item','aria-label':'Выйти из чата',title:'Выйти из чата',children:<><span className="chat-section-dock__circle"><LogOut size={22}/></span><span>Выход</span></>};
 const to=chatReturnRoute(owner??account);
 return routed?<Link {...props} to={to}/>:<a {...props} href={to}/>;
}
