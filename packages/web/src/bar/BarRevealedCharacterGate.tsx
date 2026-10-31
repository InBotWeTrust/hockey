import {useEffect, useState, type ReactNode} from 'react';
import {Navigate,useParams} from 'react-router-dom';
import {fetchBarLayout} from './layoutApi.js';
export function BarRevealedCharacterGate({children,character}:{children:ReactNode;character?:string}) {
  const params=useParams();
  const restricted=['maria','arsenich','timofey','elina'].includes(character??params.opponentId??'maria');
  const [allowed,setAllowed]=useState<boolean|null>(null);
  const [failed,setFailed]=useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let cancelled=false;
    setFailed(false);
    void fetchBarLayout().then(snapshot=>{if(!cancelled)setAllowed(snapshot.novice===false);})
      .catch(()=>{if(!cancelled)setFailed(true);});
    return()=>{cancelled=true;};
  },[attempt]);
  if(!restricted)return <>{children}</>;
  if(allowed===false)return <Navigate to="/bar" replace/>;
  if(allowed===true)return <>{children}</>;
  return <main><p role={failed?'alert':'status'}>{failed?'Не удалось проверить доступ.':'Загружаем…'}</p>{failed&&<button className="btn" onClick={()=>setAttempt(value=>value+1)}>Повторить</button>}</main>;
}
