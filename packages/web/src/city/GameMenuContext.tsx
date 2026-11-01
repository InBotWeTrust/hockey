import {createContext,useContext,useMemo,useState,type ReactNode} from 'react';
import type {GameDockStatus} from './gameDockStatus.js';
const Context=createContext({status:{label:null,urgent:false} as GameDockStatus,setStatus:(_status:GameDockStatus)=>{},guideActive:false,setGuideActive:(_active:boolean)=>{},mapHost:null as HTMLElement|null,setMapHost:(_host:HTMLElement|null)=>{}});
export const useGameMenu=()=>useContext(Context);
export function GameMenuProvider({children}:{children:ReactNode}):JSX.Element {
 const [status,setStatus]=useState<GameDockStatus>({label:null,urgent:false});
 const [guideActive,setGuideActive]=useState(false);
 const [mapHost,setMapHost]=useState<HTMLElement|null>(null);
 const value=useMemo(()=>({status,setStatus,mapHost,setMapHost,guideActive,setGuideActive}),[status,mapHost,guideActive]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
