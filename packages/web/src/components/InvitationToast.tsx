import './navigation-geometry.css';
import type { ReactNode } from 'react';
import { UserAvatar } from '../chat/components/UserAvatar.js';
export function InvitationCard({ name, avatarUrl, description, children }: { name: string; avatarUrl: string | null | undefined; description: string; children: ReactNode }) {
  return <div className="glass" style={{borderRadius:22,padding:12,display:'grid',gap:10}}>
    <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
      <UserAvatar avatarUrl={avatarUrl} name={name} size={42} fontSize={16} style={{border:'var(--navigation-selected-border)',boxShadow:'var(--navigation-selected-shadow)'}}/>
      <div style={{minWidth:0}}>
        <div style={{color:'var(--ink)',fontSize:14,fontWeight:950,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</div>
        <div style={{color:'var(--muted)',fontSize:12,fontWeight:760,marginTop:2}}>{description}</div>
      </div>
    </div>
    {children}
  </div>;
}
export function InvitationToast(props: Parameters<typeof InvitationCard>[0]) {
  return <div role="status" aria-live="polite" style={{position:'fixed',top:'calc(var(--app-safe-top) + 10px)',left:'50%',transform:'translateX(-50%)',width:'min(402px, calc(100vw - 24px))',zIndex:700,pointerEvents:'auto'}}><InvitationCard {...props}/></div>;
}
