import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDefaultBarLayout, type BarAction, type BarOccupantId } from '@hockey/game-core';
import { DurakLaunchModal } from './cards/DurakModals.js';
import type { ComputerOpponentId } from './cards/computerOpponents.js';
import { fetchBarLayout } from './layoutApi.js';
import { BarScene } from './BarScene.js';
import { BarConversation } from './BarConversation.js';
import { barCharacters, fetchConversation, type BarCharacter } from './conversationApi.js';
export function BarPanorama() {
  const navigate = useNavigate();
  const [layout, setLayout] = useState(createDefaultBarLayout);
  const [slot, setSlot] = useState('bar-8');
  const [opponent, setOpponent] = useState<ComputerOpponentId | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const touched = useRef(false);
  const [conversation, setConversation] = useState<BarCharacter | null>(null);
  const [started, setStarted] = useState<Partial<Record<BarCharacter, boolean>>>({});
  const selectedCharacter = layout.slots.find((s) => s.id === slot)?.occupantId;
  useEffect(() => {
    if (!selectedCharacter || !barCharacters.includes(selectedCharacter as BarCharacter)) return;
    let cancelled = false;
    const character = selectedCharacter as BarCharacter;
    void fetchConversation(character)
      .then((data) => {
        if (!cancelled)
          setStarted((previous) => ({ ...previous, [character]: data.turns.length > 0 }));
      })
      .catch(() => {
        /* The conversation panel provides a retryable error. */
      });
    return () => {
      cancelled = true;
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
        activeSlotId={slot}
        onSelectSlot={(id) => {
          touched.current = true;
          setSlot(id);
        }}
        onAction={action}
        onTalk={setConversation}
        conversationStarted={!!started[selectedCharacter as BarCharacter]}
        onBack={() => navigate('/sections')}
        notice={
          error ? (
            <>
              <span>Не удалось загрузить расстановку.</span>
              <button onClick={() => setRetry((v) => v + 1)}>Повторить</button>
            </>
          ) : undefined
        }
      />
      {conversation && (
        <BarConversation
          key={conversation}
          character={conversation}
          name={layout.profiles[conversation].name}
          avatar={layout.profiles[conversation].avatar}
          role={layout.profiles[conversation].role}
          onClose={() => setConversation(null)}
          onUpdate={(data) =>
            setStarted((previous) => ({ ...previous, [conversation]: data.turns.length > 0 }))
          }
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
