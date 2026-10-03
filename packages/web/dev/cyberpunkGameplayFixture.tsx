import {Target,X} from 'lucide-react';
import {AccessibleModal} from '../src/components/AccessibleModal';
import {CYBERPUNK_STORY,CyberpunkHints} from '../src/game/CyberpunkBriefing';
// Synthetic visual fixture using the same shared rules. Never calls authenticated APIs.
import {useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {getBonusChallengeCondition,cyberpunkEnvironmentForHistory,cyberpunkShooterMotion,sampleCyberpunkEnvironment,
 createCyberpunkSchedule,PERSPECTIVE_COURT_VISUAL_Y_SCALE,PERSPECTIVE_COURT_GOALIE_VISUAL_Y_OFFSET,PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE,
 type BonusChallengeEnvironmentRules,type BonusChallengeShotPause,type CyberpunkPanelEvent} from '@hockey/game-core';
import {PlayView,PERSPECTIVE_PLAYER_OPTIONS} from '../src/game/PlayView';
import {CyberpunkEffects} from '../src/game/CyberpunkEffects';
import {cyberpunkNotice} from '../src/game/cyberpunkNotice';
import '../src/app/global.css';
import '../src/app/design-system.css';
const env:BonusChallengeEnvironmentRules={cyberpunk:{version:1,seed:'cyberpunk-local-v1',durationMs:150000},
 baseModifiers:{goalMultiplier:1.2,goalieMultiplier:1.26,shooterMultiplier:1.1,puckSpeedMultiplier:1.05,label:'Неоновый разгон'},
 fatigue:{slowdownStartMs:12000,heavyStartMs:24000,stopStartMs:36000,stopDurationMs:4000,recoveryDurationMs:6000,slowMultiplier:.85,heavyMultiplier:.65}};
const speeds={goalFreq:.72,goalieFreq:.81,shooterFreq:.82,puckSpeed:1.30};
const goalie={id:'cyberpunk-local',name:'Киберпанк',pattern:'linear' as const,hp:0,baseReward:0,firstClearBonus:0,speed:0,amplitude:1,frequency:.81,goalAmplitude:220,goalFrequency:.72};
function Fixture(){
 const [preview,setPreview]=useState(true);
 const [epoch,setEpoch]=useState(0),[start,setStart]=useState(0),[done,setDone]=useState(false),[shots,setShots]=useState(0),[goals,setGoals]=useState(0);
 const endsAt=useMemo(()=>Date.now()+150000-start,[epoch,start]);
 const latest=useRef({time:start,pauses:[] as readonly BonusChallengeShotPause[]});
 const [taps,setTaps]=useState<CyberpunkPanelEvent[]>([]);
 const [ui,setUi]=useState(()=>cyberpunkNotice(env,start,taps));
 useEffect(()=>{const timer=setInterval(()=>setUi(cyberpunkNotice(env,latest.current.time,taps,latest.current.pauses)),100);return()=>clearInterval(timer);},[taps]);
 const reset=(time=0)=>{setStart(time);setDone(false);setShots(0);setGoals(0);setTaps([]);latest.current={time,pauses:[]};setUi(cyberpunkNotice(env,time,[]));setEpoch(n=>n+1);};
 const tap=()=>{const time=latest.current.time,scene=sampleCyberpunkEnvironment(env.cyberpunk!,time,taps);if(!scene.activeStrip||time<(taps.at(-1)?.tapTime??-Infinity)+180)return;
  setTaps([...taps,{id:crypto.randomUUID(),eventId:scene.activeStrip.id,tapTime:time}]);};
 return <><PlayView key={epoch} active={!done&&!preview} suppressedByModal={done||preview} showIceCar={false} onBack={()=>reset()}
  seed={env.cyberpunk!.seed} goalieId={null} goalieConfig={goalie} periodNumber={1} periodsTotal={1}
  periodEndsAt={endsAt} initialSceneElapsedMs={start} initialShooterElapsedMs={start} onTimerExpired={()=>setDone(true)}
  speedOverrides={speeds} playerOptions={PERSPECTIVE_PLAYER_OPTIONS}
  shooterMotionTime={(time,pauses)=>{latest.current={time,pauses};return cyberpunkShooterMotion(env,time,speeds.shooterFreq,pauses);}}
  duelCondition={(time)=>getBonusChallengeCondition(cyberpunkEnvironmentForHistory(env,latest.current.pauses),time)}
  cyberpunkEnvironment={{rules:env.cyberpunk!,taps}}
  scoreboardDimmed={ui.scene.outage}
  rinkUnderlay={<CyberpunkEffects scene={ui.scene} layer="ice"/>}
  rinkOverlay={<CyberpunkEffects scene={ui.scene} layer="panel" onTap={tap}/>}
  goalieOptions={{visualYScale:PERSPECTIVE_COURT_VISUAL_Y_SCALE,visualYOffset:PERSPECTIVE_COURT_GOALIE_VISUAL_Y_OFFSET,visualXScale:PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE,
   sizeScale:1.134,idleSizeScale:1.22,saveSizeScale:.96,saveVisualYOffset:10,idleSpriteUrl:'/bonus-games/goalkeepers/cyberpunk-yard-ready.webp',saveSpriteUrl:'/bonus-games/goalkeepers/cyberpunk-yard-save.webp'}}
  longCourtBackground="/bonus-games/arenas/cyberpunk-yard.webp" rinkBorderRadius={28}
  conditionNoticeOverride statusNotice={ui.notice} statusNoticeTone={ui.tone} statusNoticeUnderScoreboard statusNoticeClassName="bonus-challenge-environment-notice"
  shots={shots} goals={goals} shotIndexBase={shots} scoreboardNotice="Локальная визуальная проверка"
  optimisticAddShot={result=>{setShots(n=>n+1);if(result==='goal')setGoals(n=>n+1);}}
  submitShot={async({claimedResult})=>({serverResult:claimedResult,state:null})} applyState={()=>undefined}/>
 {preview&&<AccessibleModal title="Неоновый ритм" copy={null} onRequestClose={()=>{setPreview(false);reset();}} cardClassName="bonus-game-preview-modal bonus-game-launch-modal"
 headerAction={<button className="icon-btn" aria-label="Закрыть" onClick={()=>{setPreview(false);reset();}}><X size={15}/></button>}>
 <img className="bonus-game-preview-modal__artwork" src="/bonus-games/location-cards/cyberpunk-yard.webp" alt="Киберпанк-двор"/>
 <p className="modal-copy bonus-game-preview-modal__story">{CYBERPUNK_STORY}</p>
 <p className="bonus-game-preview-modal__condition"><Target size={20} className="bonus-game-preview-modal__condition-icon"/>Набери 18 очков меткости за 2 минуты 30 секунд.</p>
 <CyberpunkHints/><div className="modal-actions"><button className="modal-primary btn btn--cta" onClick={()=>{setPreview(false);reset();}}>Начать игру</button></div>
 </AccessibleModal>}
 <div style={{position:'fixed',bottom:0,padding:8,background:'#e6f1fb',fontSize:11,zIndex:500}}>
  Локальный стенд · без серверной попытки · <button onClick={()=>setPreview(true)}>Описание</button> <button onClick={()=>reset()}>Заново</button>
  <button onClick={()=>reset(createCyberpunkSchedule(env.cyberpunk!).find(event=>event.kind==='strip')!.startMs+1000)}>Полоса</button>
  <button onClick={()=>reset(createCyberpunkSchedule(env.cyberpunk!).find(event=>event.kind==='outage')!.startMs+1000)}>Свет</button>
  <button onClick={()=>reset(36000)}>Передышка</button>
 </div></>;
}
document.documentElement.style.setProperty('--app-play-safe-bottom','44px');
const root=createRoot(document.getElementById('root')!);root.render(<Fixture/>);import.meta.hot?.dispose(()=>root.unmount());
