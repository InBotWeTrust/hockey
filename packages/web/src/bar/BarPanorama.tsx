import { VisitorShop } from './VisitorShop.js';
import { useBarActivity } from './barActivity.js';
import {useAuthStore} from '../auth/authStore.js';
import {claimDailyGreeting,hasDailyGreeting,localDay,nextLocalMidnight} from './dailyGreeting.js';
import {emotionFromSnapshot,canGreet,preloadEmotions,prepareGreeting,entryEmotion,type CharacterEmotion} from './characterEmotion.js';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createDefaultBarLayout, type BarAction, type BarOccupantId } from '@hockey/game-core';
import { CharacterLaunch } from './games/CharacterLaunch.js';
import type { GameCharacter } from '@hockey/game-core';
import { DurakLaunchModal } from './cards/DurakModals.js';
import type { ComputerOpponentId } from './cards/computerOpponents.js';
import { fetchBarLayout } from './layoutApi.js';
import { BarScene } from './BarScene.js';
import { BarConversation } from './BarConversation.js';
import { barCharacters, fetchConversation, sendPhysicalIncident, type BarCharacter } from './conversationApi.js';
export function BarPanorama() {
  const navigate = useNavigate();
  const location = useLocation();
  const [visitorShop, setVisitorShop] = useState(false);
  const activityCounts = useBarActivity();
  const account=useAuthStore(state=>state.user?.id)??'preview';
  const [day,setDay]=useState(localDay);
  const [visible,setVisible]=useState(()=>document.visibilityState!=='hidden');
  useEffect(()=>{
    let midnight:ReturnType<typeof setTimeout>;
    const refresh=()=>{
      setDay(localDay());
      setVisible(document.visibilityState!=='hidden');
      clearTimeout(midnight);
      midnight=setTimeout(refresh,Math.max(1,nextLocalMidnight()-Date.now()));
    };
    refresh();
    window.addEventListener('focus',refresh);
    document.addEventListener('visibilitychange',refresh);
    return()=>{clearTimeout(midnight);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[]);
  const [layout, setLayout] = useState(createDefaultBarLayout);
  const [layoutReady,setLayoutReady]=useState(false);
  const [slot, setSlot] = useState(() => sessionStorage.getItem('bar-active-slot') || 'bar-8');
  useEffect(() => {
    if (layoutReady && new URLSearchParams(location.search).get('visitorShop') === '1') {
      const igor = layout.slots.find(s => s.occupantId === 'igor');
      if (igor) setSlot(igor.id);
      setConversation(null); setVisitorShop(true);
    }
  }, [location.search, layoutReady, layout]);
  const [opponent, setOpponent] = useState<ComputerOpponentId | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const touched = useRef(!!sessionStorage.getItem('bar-active-slot'));
  const [conversation, setConversation] = useState<BarCharacter | null>(null);
  const [incidentError,setIncidentError]=useState(false);
  const pendingIncident=useRef<{character:BarCharacter;id:string}|null>(null);
  const incidentSending=useRef(false);
  const [conversationVersion,setConversationVersion]=useState(0);
  const physicalIncident=async(character:BarCharacter)=>{
    if(incidentSending.current)return;
    const event=pendingIncident.current ?? {character,id:crypto.randomUUID()};
    pendingIncident.current=event;incidentSending.current=true;setIncidentError(false);
    try {
      const snapshot=await sendPhysicalIncident(event.character,event.id);
      pendingIncident.current=null;
      setConversationVersion(v=>v+1);setConversation(event.character);
      setStarted(previous=>({...previous,[event.character]:true}));
      if(snapshot.turns.some(turn=>turn.fightId))window.dispatchEvent(new Event('bar-access-changed'));
    }catch{setIncidentError(true);}finally{incidentSending.current=false;}
  };
  useEffect(()=>{
    if(!layoutReady||!(location.state as {staffRoomWarning?:boolean}|null)?.staffRoomWarning)return;
    const olegSlot=layout.slots.find(s=>s.occupantId==='oleg');
    if(!olegSlot)return;
    touched.current=true;setSlot(olegSlot.id);sessionStorage.setItem('bar-active-slot',olegSlot.id);
    setConversation('oleg');setGreeting(null);setConversationVersion(v=>v+1);
    navigate('/bar',{replace:true,state:null});
  },[location.state,layout,layoutReady,navigate]);
  const activeConversation=useRef(conversation);activeConversation.current=conversation;
  const moodRevision=useRef<Partial<Record<BarCharacter,number>>>({});
  const [emotions,setEmotions]=useState<Partial<Record<BarCharacter,CharacterEmotion>>>({});
  const [thinking,setThinking]=useState<BarCharacter|null>(null);
  const [greeting,setGreeting]=useState<BarCharacter|null>(null);
  useEffect(()=>{if(conversation){setGreeting(null);preloadEmotions(conversation);}},[conversation]);
  const [started, setStarted] = useState<Partial<Record<BarCharacter, boolean>>>({});
  const selectedCharacter = layout.slots.find((s) => s.id === slot)?.occupantId;
  useEffect(() => {
    setGreeting(null);
    if (!visible || !selectedCharacter || !barCharacters.includes(selectedCharacter as BarCharacter)) return;
    let cancelled = false;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const character = selectedCharacter as BarCharacter;
    void fetchConversation(character)
      .then(async (data) => {
        const greetingReady=!hasDailyGreeting(account,character)&&canGreet(data)&&await prepareGreeting(character);
        if (!cancelled) {
          if(!activeConversation.current&&data.revision>=(moodRevision.current[character]??-1)){
            setEmotions(previous=>({...previous,[character]:entryEmotion(data)}));
            if(greetingReady){timer=setTimeout(()=>{if(activeConversation.current || (moodRevision.current[character]??-1)>data.revision||!claimDailyGreeting(account,character))return;setGreeting(character);timer=setTimeout(()=>setGreeting(current=>current===character?null:current),2200);},650);}
          }
          if(data.revision>=(moodRevision.current[character]??-1))setStarted((previous) => ({ ...previous, [character]: data.turns.length > 0 }));
        }
      })
      .catch(() => {
        /* The conversation panel provides a retryable error. */
      });
    return () => {
      cancelled = true;clearTimeout(timer);
    };
  }, [selectedCharacter,account,day,visible]);
  useEffect(() => {
    let cancelled = false;
    setError(false);
    void fetchBarLayout()
      .then(async (snapshot) => {
        await Promise.all(
          Object.values(snapshot.layout.profiles)
            .flatMap((p) => [p.avatar, p.composition])
            .filter((src): src is string => !!src)
            .map(
              (src) =>
                new Promise<void>((resolve) => {
                  const img = new Image();
                  const timer = setTimeout(() => {
                    img.onload = null;
                    img.onerror = null;
                    resolve();
                  }, 6000);
                  const done = () => {
                    clearTimeout(timer);
                    img.onload = null;
                    img.onerror = null;
                    resolve();
                  };
                  img.onload = done;
                  img.onerror = done;
                  img.src = src;
                }),
            ),
        );
        if (cancelled) return;
        setLayout(snapshot.layout);
        setLayoutReady(true);
        setSlot((current) =>
          !touched.current
            ? snapshot.layout.defaultSlotId
            : snapshot.layout.slots.some((s) => s.id === current)
              ? current
              : snapshot.layout.defaultSlotId,
        );
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);
  const [gameCharacter, setGameCharacter] = useState<GameCharacter | null>(null);
  const action = (kind: BarAction, id: BarOccupantId) => {
    if (kind === 'cards') setOpponent('maria');
    else if (kind === 'battleship' || kind === 'armwrestling' || kind === 'ochko' || kind === 'darts' || kind === 'billiards' || kind === 'checkers')
      setGameCharacter(id as GameCharacter);
    else if (kind === 'online') navigate('/bar/cards/online', { state: { mode: 'online' } });
    else navigate('/bar/broadcasts');
  };
  return (
    <>
      <BarScene
        onVisitorShop={() => setVisitorShop(true)} activityCounts={activityCounts}
        layout={layout}
        onStaffRoom={(id) => {sessionStorage.setItem('bar-staff-return-slot', id); sessionStorage.setItem('bar-active-slot', id); navigate('/bar/staff-room');}}
        characterEmotions={greeting&&!conversation?{...emotions,[greeting]:'greeting'}:thinking&&!['empathy','displeasure'].includes(emotions[thinking]??'neutral')?{...emotions,[thinking]:'interest'}:emotions}
        hideIdentity={conversation !== null}
        activeSlotId={slot}
        onSelectSlot={(id) => {
          touched.current = true;
          sessionStorage.setItem('bar-active-slot', id);
          setSlot(id);
        }}
        onAction={action}
        onTalk={setConversation}
        {...(!incidentError ? {onPhysicalIncident:(character:BarCharacter)=>void physicalIncident(character)} : {})}
        conversationStarted={!!started[selectedCharacter as BarCharacter]}
        onBack={() => navigate('/sections')}
        notice={
          incidentError ? <><span>Не удалось вызвать Олега.</span><button onClick={()=>{const event=pendingIncident.current;if(event)void physicalIncident(event.character);}}>Повторить</button></> : error ? (
            <>
              <span>Не удалось загрузить расстановку.</span>
              <button onClick={() => setRetry((v) => v + 1)}>Повторить</button>
            </>
          ) : undefined
        }
      />
      {visitorShop && <VisitorShop onClose={() => { setVisitorShop(false); if (location.search.includes('visitorShop')) navigate('/bar', { replace: true }); }} />}
      {conversation && (
        <BarConversation
          key={`${conversation}:${conversationVersion}`}
          onVisitorShop={() => navigate('/bar?visitorShop=1')}
          character={conversation}
          name={layout.profiles[conversation].name}
          avatar={layout.profiles[conversation].avatar}
          role={layout.profiles[conversation].role}
          onClose={() => {setConversation(null);setThinking(null);}}
          onWaiting={waiting=>setThinking(current=>waiting?conversation:current===conversation?null:current)}
          onUpdate={(data) => {
            setGreeting(null);
            if(data.revision<(moodRevision.current[conversation]??-1))return;
            moodRevision.current[conversation]=data.revision;
            setEmotions(previous=>({...previous,[conversation]:emotionFromSnapshot(data)}));
            setStarted((previous) => ({ ...previous, [conversation]: data.turns.length > 0 }));
          }}
        />
      )}
      {gameCharacter && <CharacterLaunch character={gameCharacter} close={() => setGameCharacter(null)} />}
      {opponent && (
        <DurakLaunchModal
          opponentId={opponent}
          onClose={() => setOpponent(null)}
          onPlay={() => navigate(`/bar/cards/computer/${opponent}`)}
        />
      )}
    </>
  );
}
