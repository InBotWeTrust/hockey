import {snapshot} from './cards/onlineApi.js';
import {useQuery} from '@tanstack/react-query';
import {useNavigate} from 'react-router-dom';
import {useAuthStore} from '../auth/authStore.js';
import {useBarMenuStore} from './barMenuStore.js';
import {readRoom} from './cards/roomApi.js';
import {gameApi} from './games/api.js';
import {barMenuEntries} from './barMenuEntries.js';
export function useBarMenuEntries(){
 const owner=useAuthStore(s=>s.user?.id),navigate=useNavigate();
 const cards=useBarMenuStore(s=>s.cards),games=useBarMenuStore(s=>s.games);
 const cardData=cards?.owner===owner?cards?.data:null,gameData=games?.owner===owner?games?.data:null;
 const roomId=cardData?.roomId,matchId=gameData?.matchId,cardMatchId=cardData?.matchId;
 const cardMatch=useQuery({queryKey:['bar-menu',owner,'card-match',cardMatchId],queryFn:()=>snapshot(cardMatchId!),enabled:!!owner&&!!cardMatchId&&!roomId,refetchInterval:5000,retry:false});
 const room=useQuery({queryKey:['bar-menu',owner,'room',roomId],queryFn:()=>readRoom(roomId!),enabled:!!owner&&!!roomId,refetchInterval:5000,retry:false});
 const match=useQuery({queryKey:['bar-menu',owner,'match',matchId],queryFn:()=>gameApi.read(matchId!),enabled:!!owner&&!!matchId,refetchInterval:5000,retry:false});
 let localCards=false;
 if(owner)try{const saved=JSON.parse(sessionStorage.getItem(`bar-maria-game:${owner}`)??'null');localCards=!!saved&&saved.result===null&&Array.isArray(saved.hands);}catch{/* Corrupt or unavailable local saves are ignored. */}
 return owner?barMenuEntries(owner,cardData??null,gameData??null,room.data,match.data,navigate,Date.now(),localCards,cardMatch.data):[];
}
