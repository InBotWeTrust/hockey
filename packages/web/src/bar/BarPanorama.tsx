import {emotionFromSnapshot,canGreet,preloadEmotions,type CharacterEmotion} from './characterEmotion.js';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDefaultBarLayout, type BarAction, type BarOccupantId } from '@hockey/game-core';
import { DurakLaunchModal } from './cards/DurakModals.js';
import type { ComputerOpponentId } from './cards/computerOpponents.js';
import { fetchBarLayout } from './layoutApi.js';
import { BarScene } from './BarScene.js';
import { BarConversation } from './BarConversation.js';
import { barCharacters, fetchConversation, sendPhysicalIncident, type BarCharacter } from './conversationApi.js';
export function BarPanorama() {
  const navigate = useNavigate();
  const [layout, setLayout] = useState(createDefaultBarLayout);
  const [slot, setSlot] = useState(() => sessionStorage.getItem('bar-active-slot') || 'bar-8');
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
    if (!selectedCharacter || !barCharacters.includes(selectedCharacter as BarCharacter)) return;
    let cancelled = false;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const character = selectedCharacter as BarCharacter;
    void fetchConversation(character)
      .then((data) => {
        if (!cancelled) {
          if(!activeConversation.current&&data.revision>(moodRevision.current[character]??-1)){
            setEmotions(previous=>({...previous,[character]:'neutral'}));
            if(canGreet(data)&&Math.random()<0.5){setGreeting(character);timer=setTimeout(()=>setGreeting(current=>current===character?null:current),2200);}
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
  }, [selectedCharacter]);
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
  const action = (kind: BarAction, id: BarOccupantId) => {
    if (kind === 'cards') setOpponent(id as ComputerOpponentId);
    else if (kind === 'online') navigate('/bar/cards/online', { state: { mode: 'online' } });
    else navigate('/bar/broadcasts');
  };
  return (
    <>
      <BarScene
        layout={layout}
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
      {conversation && (
        <BarConversation
          key={`${conversation}:${conversationVersion}`}
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
