import {createContext,useContext,useMemo,useState,type ReactNode} from 'react';
import type {GameDockStatus} from './gameDockStatus.js';
const Context=createContext({status:{label:null,urgent:false} as GameDockStatus,setStatus:(_status:GameDockStatus)=>{}});
export const useGameMenu=()=>useContext(Context);
export function GameMenuProvider({children}:{children:ReactNode}):JSX.Element {
 const [status,setStatus]=useState<GameDockStatus>({label:null,urgent:false});
 const value=useMemo(()=>({status,setStatus}),[status]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
