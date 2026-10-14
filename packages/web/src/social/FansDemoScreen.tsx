import { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { SegmentedTabs } from '../components/SegmentedTabs.js';
import { Sheet } from '../components/Sheet.js';
import { PublicSportingPassport } from '../chat/components/UserProfileSheet.js';
import { AchievementCard } from '../screens/AchievementsScreen.js';
import { AchievementDetailsSheet } from '../screens/profileSections.js';
import { PushPreferenceToggle } from '../screens/ProfileSupportSections.js';
import { SocialFeed } from './SocialFeed.js';
import { SocialProvider } from './SocialContext.js';
import { FAN_STAGES, createDemoModel, DEMO_OWNER, DEMO_PLAYER, DEMO_OPPONENT, DEMO_SCENARIOS, demoProfile, fanAchievements, type DemoScenario } from './demoFixtures.js';
import type { SocialUser } from './api.js';
import type { AchievementDto } from '../api/achievements.js';

function FixtureProfile({user,onClose}:{user:SocialUser;onClose:()=>void}):JSX.Element {
 return <Sheet open title="Профиль игрока" hideTitle onRequestClose={onClose} grabberPlacement="top" dragHandleOnly maxHeight="94dvh" headerAction={<button className="icon-btn" aria-label="Закрыть" onClick={onClose}><X size={14}/></button>}>
  <PublicSportingPassport profile={demoProfile(user)} displayName={user.displayName} avatarUrl={user.avatarUrl} onOpenTrophy={()=>{}} onOpenEarlyPlayerStatus={()=>{}}/>
 </Sheet>;
}
export function FansDemoScreen():JSX.Element {
 const [params,setParams]=useSearchParams();
 const scenario=(DEMO_SCENARIOS.some(([id])=>id===params.get('case'))?params.get('case'):'all') as DemoScenario;
 const model=useMemo(()=>createDemoModel(scenario),[scenario]);
 const client=useMemo(()=>new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}}),[scenario]);
 const [tab,setTab]=useState<'profiles'|'feed'|'achievements'>('profiles');
 const [selected,setSelected]=useState<SocialUser|null>(null);
 const [messagePreview,setMessagePreview]=useState(false);
 const [count,setCount]=useState(1000);const [peak,setPeak]=useState(1000);
 const [claimed,setClaimed]=useState(new Set<string>());const [achievement,setAchievement]=useState<AchievementDto|null>(null);
 const [pushEnabled,setPushEnabled]=useState(true);const [pushCount,setPushCount]=useState(0);
 const rewards=fanAchievements(peak,claimed);const stars=FAN_STAGES.filter(([threshold])=>claimed.has(`fans-${threshold}`)).reduce((sum,[,,reward])=>sum+reward,0);
 const changeScenario=(value:DemoScenario)=>{
  const next=new URLSearchParams({case:value});
  if(value==='push'||value==='push-missing'){next.set('social','fans');next.set('fanId',value==='push'?DEMO_OPPONENT.id:'missing');}
  setParams(next);setTab('profiles');setPushCount(0);
 };
 return <main className="screen" style={{maxWidth:480,margin:'0 auto',padding:'16px 14px',paddingBottom:40}}>
  <h1 className="section-label">Болельщики и лента</h1>
  <p className="modal-copy">Локальная демонстрация на синтетических данных. Настоящие аккаунты, баланс и push не изменяются.</p>
  <label className="section-label" htmlFor="fans-demo-case">Сценарий</label>
  <select id="fans-demo-case" className="input" value={scenario} onChange={e=>changeScenario(e.target.value as DemoScenario)} style={{width:'100%',marginBottom:12}}>{DEMO_SCENARIOS.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>
  <QueryClientProvider client={client}><SocialProvider key={scenario} value={{viewerId:DEMO_OWNER.id,api:model.api,openMessage:()=>setMessagePreview(true),renderProfile:(user,onClose)=><FixtureProfile user={user} onClose={onClose}/>}}>
   {messagePreview&&<p className="modal-copy" role="status">В приложении открывается личный чат с игроком. В демонстрации настоящий чат не создаётся.</p>}
   <SegmentedTabs ariaLabel="Сценарии нового функционала" activeTab={tab} onChange={setTab} items={[{id:'profiles',label:'Профили'},{id:'feed',label:'Лента'},{id:'achievements',label:'Задания'}]}/>
   {tab==='profiles'&&<>
    <section className="glass" style={{padding:16,borderRadius:20,marginTop:12}}>
     <PublicSportingPassport profile={demoProfile(DEMO_OWNER)} displayName={DEMO_OWNER.displayName} avatarUrl={null} onOpenTrophy={()=>{}} onOpenEarlyPlayerStatus={()=>{}}/>
    </section>
    <section className="glass" style={{padding:16,borderRadius:20,marginTop:12}}>
     <PublicSportingPassport profile={demoProfile(DEMO_PLAYER)} displayName={DEMO_PLAYER.displayName} avatarUrl={null} onOpenTrophy={()=>{}} onOpenEarlyPlayerStatus={()=>{}}/>
     <button className="btn btn--ghost" onClick={()=>setSelected(DEMO_PLAYER)}>Открыть профиль из чата / рейтинга</button>
    </section>
    <section className="glass" style={{padding:16,borderRadius:20,marginTop:12}}>
     <PushPreferenceToggle label="Новые болельщики" hint="Только о подписке, не чаще одного раза в сутки от игрока" checked={pushEnabled} disabled={false} onToggle={()=>{setPushEnabled(v=>!v);model.setPushEnabled(!pushEnabled);}}/>
     <div className="modal-actions"><button className="btn btn--ghost" onClick={()=>{model.simulateFan();setPushCount(model.pushLog.length);}}>Повторить подписку для push</button><button className="btn btn--cta" onClick={()=>{const next=new URLSearchParams(params);next.set('social','fans');next.set('fanId',DEMO_OPPONENT.id);setParams(next);}}>Открыть как из push</button></div>
     <p className="modal-copy" role="status">Уведомлений в демонстрации: {pushCount}</p>
    </section>
   </>}
   {tab==='feed'&&<><SegmentedTabs ariaLabel="Раздел чата" activeTab="feed" onChange={()=>{}} items={[{id:'messenger',label:'Мессенджер',disabled:true},{id:'feed',label:'Лента'}]}/><SocialFeed/></>}
   {tab==='achievements'&&<>
    <p className="modal-copy">Звёзды: {stars} · Опыт: {stars}. Полученные награды сохраняются после отписок.</p>
    <label className="section-label" htmlFor="fans-demo-count">Текущее количество болельщиков</label>
    <select id="fans-demo-count" className="input" value={count} onChange={e=>{const n=Number(e.target.value);setCount(n);setPeak(v=>Math.max(v,n));}}>{[0,1,10,20,50,100,500,1000].map(n=><option key={n} value={n}>{n}</option>)}</select>
    <button className="btn btn--ghost" onClick={()=>{setCount(0);setPeak(0);setClaimed(new Set());}}>Начать цепочку заново</button>
    <div className="achievements-list">{rewards.map(a=><AchievementCard key={a.id} achievement={a} claimDisabled={!a.isClaimable} onOpen={()=>setAchievement(a)} onClaim={()=>setClaimed(previous=>new Set([...previous,`fans-${FAN_STAGES[a.stage!.current-1]![0]}`]))}/>)}</div>
   </>}
   {selected&&<FixtureProfile user={selected} onClose={()=>setSelected(null)}/>}
   {achievement&&<AchievementDetailsSheet achievement={achievement} onClose={()=>setAchievement(null)}/>}
  </SocialProvider></QueryClientProvider>
 </main>;
}
