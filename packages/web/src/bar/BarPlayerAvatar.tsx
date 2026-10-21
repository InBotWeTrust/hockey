import {UserAvatar} from '../chat/components/UserAvatar.js';

export function BarPlayerAvatar({player}:{player:{displayName:string;avatarUrl:string|null;lastSeenAt?:string|null}}):JSX.Element {
 const online=Boolean(player.lastSeenAt && Date.now()-new Date(player.lastSeenAt).getTime()<90_000);
 return <span style={{position:'relative',display:'inline-flex'}}>
  <UserAvatar avatarUrl={player.avatarUrl} name={player.displayName} size={44} fontSize={16} style={{color:'var(--liquid-ink)'}}/>
  <span aria-label={`${online?'В сети':'Не в сети'}: ${player.displayName}`} style={{position:'absolute',right:1,bottom:1,width:11,height:11,borderRadius:999,background:online?'#22c55e':'#94a3b8',border:'2px solid rgba(226,240,252,.98)'}}/>
 </span>;
}
