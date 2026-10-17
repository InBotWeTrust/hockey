import { useState, useRef, useEffect, type ReactNode } from 'react';
import { barBattleship as sea, type BarGameAction } from '@hockey/game-core';
const letters = 'АБВГДЕЖЗИКЛМ';
const shipColor = (s: sea.Ship) => s.kind === 'standard' ? `standard-${Math.max(s.w, s.h)}` : s.kind;
const shipName = (s: sea.Ship) => s.kind === 'carrier' ? 'Авианосец' : s.kind === 'submarine' ? 'Подлодка' : ({1: 'Катер', 2: 'Эсминец', 3: 'Крейсер', 4: 'Линкор'}[Math.max(s.w, s.h)] ?? 'Корабль');
export function BattleshipField({
  game,
  player,
  disabled,
  locked,
  send,
  readyAction,
  onHint,
  now = 0,
  animationStart = 0,
  countdown = false,
}: {
  game: sea.View;
  player: 0 | 1;
  disabled: boolean;
  locked: boolean;
  send: (a: BarGameAction) => void;
  readyAction?: ReactNode;
  onHint?: (hint: string) => void;
  now?: number;
  animationStart?: number;
  countdown?: boolean;
}) {
  const [own, setOwn] = useState<{value:boolean; key:string} | null>(null),
    [mode, setMode] = useState<'shot' | 'salvo' | 'move'>('shot'),
    [vertical, setVertical] = useState(false),
    [target, setTarget] = useState<{ x: number; y: number } | null>(null),
    [selected, setSelected] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    pointer: number;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    vertical: boolean;
    moved: boolean;
    x: number;
    y: number;
  } | null>(null);
  const suppressClick = useRef(false);
  const [preview, setPreview] = useState<{
    id: string;
    x: number;
    y: number;
    vertical: boolean;
  } | null>(null);
  const pendingShip = useRef<string | null>(null);
  useEffect(() => {
    const ship = game.ownShips.find(s=>s.id===pendingShip.current);
    if(ship) { setSelected(ship.id); setVertical(ship.h>ship.w); pendingShip.current=null; }
  }, [game.ownShips]);
  const effectClock = useRef({ stamp: animationStart, delay: -Math.max(0, now - animationStart) });
  if (effectClock.current.stamp !== animationStart) effectClock.current = { stamp: animationStart, delay: -Math.max(0, now - animationStart) };
  const setup = game.phase === 'setup' && !countdown;
  const impactActive = !setup && game.lastAction?.type === 'attack' && animationStart > 0 && now >= animationStart && now < animationStart + 1600;
  const opponentImpact = impactActive && game.lastAction?.player !== player;
  const boardKey = `${game.phase}:${game.turn}:${animationStart}`;
  useEffect(() => {
    if (!setup) { setTarget(null); setSelected(null); setMode('shot'); }
  }, [setup, game.turn, player, opponentImpact]);
  const showOwn = setup || (impactActive ? game.lastAction!.player !== player : (own?.key === boardKey ? own.value : game.turn !== player));

  const marks = game.shots[showOwn ? 1 - player : player]!;
  const ships = showOwn ? game.ownShips : game.enemySunk;
  const visibleImpact = impactActive && game.lastAction?.player === (showOwn ? 1 - player : player);
  const impactSunk = visibleImpact && ships.some(s => sea.cells(s).every(c=>s.hits.includes(c)) && game.lastAction!.cells.some(m=>m.hit && sea.cells(s).includes(m.cell)));
  const shake = visibleImpact && now < animationStart + 300 && game.lastAction!.cells.some(m=>m.hit);
  const submarineSelected =
    showOwn && game.ownShips.some((s) => s.id === selected && s.kind === 'submarine');
  const canPlace = (id: string, x: number, y: number, rotated: boolean) =>
    sea.validPlacement(
      game.ownShips.map((s) =>
        s.id !== id
          ? s
          : {
              ...s,
              x,
              y,
              w: rotated ? Math.min(s.w, s.h) : Math.max(s.w, s.h),
              h: rotated ? Math.max(s.w, s.h) : Math.min(s.w, s.h),
            },
      ),
    );
  const nearest = (id: string, x: number, y: number, rotated: boolean) => {
    let best: { x: number; y: number } | null = null,
      distance = Infinity;
    for (let cy = 0; cy < 12; cy++)
      for (let cx = 0; cx < 12; cx++) {
        const d = (cx - x) ** 2 + (cy - y) ** 2;
        if (d < distance && canPlace(id, cx, cy, rotated)) {
          best = { x: cx, y: cy };
          distance = d;
        }
      }
    return best;
  };
  const snap = (id: string, x: number, y: number, rotated: boolean) => {
    const destination = nearest(id, x, y, rotated);
    if (!destination) {
      onHint?.('Для поворота нет места. Сначала передвинь соседние корабли');
      return false;
    }
    send({ type: 'naval-configure', shipId: id, ...destination, vertical: rotated });
    onHint?.(`${shipName(game.ownShips.find(s => s.id === id)!)}: перетащи или поверни`);
    return true;
  };
  const place = (id: string, x: number, y: number, rotated: boolean) => {
    if (!canPlace(id, x, y, rotated)) {
      onHint?.('Корабли не должны касаться друг друга или выходить за край');
      return false;
    }
    send({ type: 'naval-configure', shipId: id, x, y, vertical: rotated });
    onHint?.(`${shipName(game.ownShips.find(s => s.id === id)!)}: перетащи или поверни`);
    return true;
  };
  const select = (x: number, y: number) => {
    if (countdown) return;
    if (setup) {
      if (locked || disabled) return;
      const ship = game.ownShips.find((s) => sea.cells(s).includes(sea.cell(x, y)));
      if (ship && ship.id !== selected) {
        setSelected(ship.id);
        setVertical(ship.h > ship.w);
        onHint?.(`${shipName(ship)}: перетащи или поверни`);
      } else if (selected) {
        if (place(selected, x, y, vertical)) setSelected(null);
      } else if (ship) {
        setSelected(ship.id);
        setVertical(ship.h > ship.w);
      }
      return;
    }
    if (showOwn && mode !== 'move') {
      const ship = game.ownShips.find(
        (s) => s.kind === 'submarine' && sea.cells(s).includes(sea.cell(x, y)),
      );
      setSelected(ship?.id ?? null);
      setTarget(null);
      return;
    }
    setTarget({ x, y });
  };
  const confirm = () => {
    if (!target) return;
    if (mode === 'move') send({ type: 'naval-move', ...target });
    else send({ type: 'naval-attack', ...target, salvo: mode === 'salvo', vertical });
    setTarget(null);
  };
  const isSelected = (x: number, y: number) =>
    !!target &&
    x >= target.x &&
    y >= target.y &&
    x < target.x + (mode === 'salvo' ? (vertical ? 2 : 3) : 1) &&
    y < target.y + (mode === 'salvo' ? (vertical ? 3 : 2) : 1);
  const allowed =
    target &&
    (mode === 'move'
      ? sea.moves(game).some((m) => m.x === target.x && m.y === target.y)
      : target.x + (mode === 'salvo' ? (vertical ? 2 : 3) : 1) <= 12 &&
        target.y + (mode === 'salvo' ? (vertical ? 3 : 2) : 1) <= 12);
  return (
    <section className="bar-naval" aria-label="Морской бой">
      <div className="bar-naval-toolbar">
        {!setup && (
          <>
            <button
              className="btn btn--ghost"
              disabled={countdown}
              aria-pressed={showOwn}
              onClick={() => {
                setOwn({value:true,key:boardKey});
                setMode('shot');
                setSelected(null);
                setTarget(null);
              }}
            >
              Мой флот
            </button>
            <button
              className="btn btn--ghost"
              disabled={countdown}
              aria-pressed={!showOwn}
              onClick={() => {
                setOwn({value:false,key:boardKey});
                setMode('shot');
                setSelected(null);
                setTarget(null);
              }}
            >
              Противник
            </button>
          </>
        )}
      </div>
      {setup && <div className="bar-naval-reserve" aria-label="Корабли для размещения">
        {sea.shipTypes().filter((s,i,a)=>a.findIndex(t=>t.kind===s.kind&&t.w===s.w&&t.h===s.h)===i).map(type=>{
          const available=sea.shipTypes().filter(s=>s.kind===type.kind&&s.w===type.w&&s.h===type.h&&!game.ownShips.some(t=>t.id===s.id));
          const name=shipName(type);
          return <button key={type.id} className="bar-naval-reserve-ship" data-ship-color={shipColor(type)} disabled={locked||disabled||!available.length} onClick={()=>{
            const ship=available[0]!; pendingShip.current=ship.id;
            send({type:'naval-deploy',shipId:ship.id,seed:crypto.getRandomValues(new Uint32Array(1))[0]!});
            onHint?.(`${name}: перетащи или поверни`);
          }}><span className="bar-naval-miniature" style={{gridTemplateColumns:`repeat(${type.w}, 7px)`}} aria-hidden="true">{Array.from({length:type.w*type.h},(_,i)=><i key={i}/>)}</span><span>{name} ×{available.length}</span></button>;
        })}
      </div>}
      <div className={`bar-naval-grid${shake ? impactSunk ? ' bar-naval-grid--sunk' : ' bar-naval-grid--hit' : ''}`} style={shake ? {animationDelay: `${effectClock.current.delay}ms`} : undefined}>
        <span aria-hidden="true" />
        <div className="bar-naval-columns" aria-hidden="true">
          {Array.from(letters).map((letter) => (
            <span key={letter}>{letter}</span>
          ))}
        </div>
        <div className="bar-naval-rows" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
        <div
          ref={boardRef}
          className="bar-naval-board"
          data-setup={setup && !locked && !disabled}
          onPointerDown={(e) => {
            if (!setup || locked || disabled || dragRef.current || e.button !== 0) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = Math.floor(((e.clientX - rect.left) * 12) / rect.width),
              y = Math.floor(((e.clientY - rect.top) * 12) / rect.height);
            const ship = game.ownShips.find((s) => sea.cells(s).includes(sea.cell(x, y)));
            if (!ship) return;
            suppressClick.current = false;
            dragRef.current = {
              id: ship.id,
              pointer: e.pointerId,
              startX: e.clientX,
              startY: e.clientY,
              offsetX: x - ship.x,
              offsetY: y - ship.y,
              vertical: ship.h > ship.w,
              moved: false,
              x: ship.x,
              y: ship.y,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
            setSelected(ship.id);
            setVertical(ship.h > ship.w);
          }}
          onPointerMove={(e) => {
            const d = dragRef.current;
            if (!d || d.pointer !== e.pointerId || locked || disabled || !setup) return;
            if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 5 && !d.moved) return;
            d.moved = true;
            const rect = e.currentTarget.getBoundingClientRect();
            d.x = Math.floor(((e.clientX - rect.left) * 12) / rect.width) - d.offsetX;
            d.y = Math.floor(((e.clientY - rect.top) * 12) / rect.height) - d.offsetY;
            setPreview({ id: d.id, x: d.x, y: d.y, vertical: d.vertical });
          }}
          onPointerUp={(e) => {
            const d = dragRef.current;
            if (!d || d.pointer !== e.pointerId) return;
            dragRef.current = null;
            setPreview(null);
            suppressClick.current = true;
            if (d.moved && setup && !locked && !disabled) snap(d.id, d.x, d.y, d.vertical);
            else onHint?.(`${shipName(game.ownShips.find(s => s.id === d.id)!)}: перетащи или поверни`);
          }}
          onPointerCancel={() => {
            dragRef.current = null;
            setPreview(null);
            suppressClick.current = true;
          }}
          onLostPointerCapture={() => {
            dragRef.current = null;
            setPreview(null);
          }}
          role="group"
          aria-label={showOwn ? 'Твой флот' : 'Поле противника'}
        >
          {Array.from({ length: 144 }, (_, c) => {
            const x = c % 12,
              y = Math.floor(c / 12),
              ship = ships.find((s) => sea.cells(s).includes(c)),
              mark = marks.find((m) => m.cell === c),
              hit = ship?.hits.includes(c) || mark?.hit;
            const impact = impactActive && game.lastAction?.player === (showOwn ? 1 - player : player) ? game.lastAction.cells.find(m => m.cell === c) : undefined;
            const destroyed = !!ship && sea.cells(ship).every(c => ship.hits.includes(c));
            return (
              <button
                key={c}
                className="bar-naval-cell"
                data-ship={!!ship}
                data-drag-source={preview?.id === ship?.id && !!preview}
                data-preview={
                  preview &&
                  (() => {
                    const s = game.ownShips.find((s) => s.id === preview.id)!;
                    const w = preview.vertical ? Math.min(s.w, s.h) : Math.max(s.w, s.h),
                      h = preview.vertical ? Math.max(s.w, s.h) : Math.min(s.w, s.h);
                    return x >= preview.x &&
                      y >= preview.y &&
                      x < preview.x + w &&
                      y < preview.y + h
                      ? canPlace(preview.id, preview.x, preview.y, preview.vertical)
                        ? 'valid'
                        : 'invalid'
                      : undefined;
                  })()
                }
                data-kind={ship?.kind}
                data-ship-color={ship ? shipColor(ship) : undefined}
                data-maneuver={
                  !setup && showOwn && mode === 'move' && sea.moves(game).some(m => m.x === x && m.y === y)
                }
                data-impact={impact ? impact.hit ? destroyed ? 'sunk' : 'hit' : 'miss' : undefined}
                data-hit={!!hit}
                data-miss={mark && !mark.hit}
                data-selected={isSelected(x, y) || ship?.id === selected}
                aria-label={`${letters[x]} ${y + 1}${hit ? ' попадание' : ship ? ' корабль' : ''}`}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  select(x, y);
                }}
              >
                {hit ? <span className={`bar-naval-damage${destroyed ? ' bar-naval-damage--sunk' : ''}`} aria-hidden="true" /> : mark ? <span className="bar-naval-miss" aria-hidden="true" /> : null}
                {impact && <span key={`${animationStart}-${c}`} className="bar-naval-impact" style={{animationDelay: `${effectClock.current.delay}ms`}} aria-hidden="true" />}
              </button>
            );
          })}
          {!preview && selected && (() => {
            const ship = ships.find(s => s.id === selected);
            return ship ? <span className="bar-naval-ship-outline" aria-hidden="true" style={{left:`${ship.x / 12 * 100}%`,top:`${ship.y / 12 * 100}%`,width:`${ship.w / 12 * 100}%`,height:`${ship.h / 12 * 100}%`}} /> : null;
          })()}
        </div>
        {setup &&
          selected &&
          !preview &&
          !locked &&
          !disabled &&
          (() => {
            const ship = game.ownShips.find((s) => s.id === selected);
            return ship && ship.w !== ship.h && canPlace(ship.id, ship.x, ship.y, !vertical) ? (
              <button
                className="icon-btn bar-naval-rotate"
                aria-label="Повернуть корабль"
                style={{
                  left: `${Math.min(90, ((ship.x + ship.w) / 12) * 100)}%`,
                  top: `${Math.min(88, ((ship.y + ship.h) / 12) * 100)}%`,
                }}
                onClick={() => {
                  if (place(ship.id, ship.x, ship.y, !vertical)) setVertical(!vertical);
                }}
              >
                ↻
              </button>
            ) : null;
          })()}
      </div>
      <div className={`bar-naval-toolbar${setup ? ' bar-naval-toolbar--ready' : ''}`}>
        {setup ? (
          readyAction
        ) : (
          <>
            <button
              className="btn btn--ghost"
              disabled={disabled || showOwn}
              aria-pressed={!showOwn && mode === 'shot'}
              onClick={() => {
                setMode('shot');
                setOwn({value:false,key:boardKey});
                setTarget(null);
              }}
            >
              Выстрел
            </button>
            <button
              className="btn btn--ghost"
              disabled={disabled || showOwn || !game.canSalvo}
              aria-pressed={!showOwn && mode === 'salvo'}
              onClick={() => {
                setMode('salvo');
                setOwn({value:false,key:boardKey});
                setTarget(null);
              }}
            >
              Залп
            </button>
            <button
              className="btn btn--ghost"
              disabled={disabled || !submarineSelected || !sea.moves(game).length}
              aria-pressed={showOwn && mode === 'move'}
              onClick={() => {
                setMode('move');
                setOwn({value:true,key:boardKey});
                setTarget(null);
              }}
            >
              Манёвр ({game.movesLeft})
            </button>
            {mode === 'salvo' && (
              <button className="btn btn--ghost" onClick={() => setVertical(!vertical)}>
                Повернуть залп
              </button>
            )}
            <button
              className="btn btn--cta"
              disabled={
                disabled ||
                !allowed ||
                (showOwn && (mode !== 'move' || !submarineSelected)) ||
                (!showOwn && mode === 'move')
              }
              onClick={confirm}
            >
              Подтвердить
            </button>
          </>
        )}
      </div>
    </section>
  );
}
