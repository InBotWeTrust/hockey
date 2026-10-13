import { createContext, useContext, type ReactNode } from 'react';
import { useAuthStore } from '../auth/authStore.js';
import { socialApi, type SocialApi, type SocialUser } from './api.js';
export interface SocialEnvironment { viewerId:string|null; api:SocialApi; openMessage?:(userId:string)=>void|Promise<void>; renderProfile?:(user:SocialUser,onClose:()=>void)=>ReactNode }
const Context=createContext<SocialEnvironment|null>(null);
export const SocialProvider=Context.Provider;
export function useSocial():SocialEnvironment {
 const environment=useContext(Context);
 const viewerId=useAuthStore(s=>s.user?.id??null);
 return environment??{viewerId,api:socialApi};
}
