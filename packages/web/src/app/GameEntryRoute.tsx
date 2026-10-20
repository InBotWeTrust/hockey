import type {ReactNode} from 'react';
import {Navigate,useLocation} from 'react-router-dom';

export function GameEntryRoute({children}:{children:ReactNode}){
 const {search}=useLocation();
 const view=new URLSearchParams(search).get('view');
 return view===null||view==='arena'||view==='hub'?<Navigate to="/sections?home=1" replace/>:<>{children}</>;
}
