import {useQuery} from '@tanstack/react-query';
import {useNavigate} from 'react-router-dom';
import {fetchAmateurMatch} from '../api/amateurDuel.js';
import {DuelOpponentPanel,DuelRulesPanel,DuelResultCard} from '../screens/DailyScreen.js';
/** Read-only details never mount a game store or a renderer. */
export function DuelDetailsPage({matchId}:{matchId:string}) {
 const navigate=useNavigate();
 const query=useQuery({queryKey:['amateur-duel','column-details',matchId],queryFn:()=>fetchAmateurMatch(matchId),retry:false});
 if(query.isLoading)return <p role="status">Загрузка…</p>;
 if(!query.data)return <section role="alert"><p>Не удалось загрузить дуэль.</p><button className="btn btn--cta" onClick={()=>void query.refetch()}>Повторить</button></section>;
 const match=query.data.match;
 return <main className="screen mode-shell"><h1 className="screen-title-on-arena">Дуэль</h1>{['settled','expired','cancelled'].includes(match.status)?<DuelResultCard match={match}/>:<><DuelOpponentPanel match={match}/><DuelRulesPanel match={match}/><button className="btn btn--cta" onClick={()=>navigate(`/?view=amateur&section=duels&match=${encodeURIComponent(matchId)}&play=1&from=sections`)}>На лёд</button></>}</main>;
}
