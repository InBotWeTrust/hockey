import { useState, useRef, useEffect, type CSSProperties, type ReactNode } from 'react';
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
  onHint?: (hint: string | null) => void;
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
  const swipeRef = useRef<{x:number;y:number;key:string} | null>(null);
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
    if (!setup) { setTarget(null); setSelected(null); setMode('shot'); onHint?.(null); }
  }, [setup, game.turn, player, opponentImpact, onHint]);
  const showOwn = setup || (impactActive ? game.lastAction!.player !== player : (own?.key === boardKey ? own.value : game.turn !== player));

  const carrierOperational = sea.carrierReady(game.ownShips.find(s => s.kind === 'carrier'));
  const submarineOperational = game.ownShips.some(s => s.kind === 'submarine' && s.hits.length === 0);
  const squareAirstrike = game.airstrikeCharge !== undefined;
  const salvoW = squareAirstrike ? 2 : vertical ? 2 : 3;
  const salvoH = squareAirstrike ? 2 : vertical ? 3 : 2;
  const marks = game.shots[showOwn ? 1 - player : player]!;
  const ships = showOwn ? game.ownShips : game.enemySunk;
  const inferredWater = new Set<number>();
  for (const ship of ships.filter(s => sea.cells(s).every(c => s.hits.includes(c)))) {
    for (let y = Math.max(0, ship.y - 1); y <= Math.min(11, ship.y + ship.h); y++) {
      for (let x = Math.max(0, ship.x - 1); x <= Math.min(11, ship.x + ship.w); x++) {
        const c = sea.cell(x, y);
        if (!sea.cells(ship).includes(c)) inferredWater.add(c);
      }
    }
  }
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
      if (ship && sea.moves(game).length) setMode('move');
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
    onHint?.(null);
  };
  const isSelected = (x: number, y: number) =>
    !!target &&
    x >= target.x &&
    y >= target.y &&
    x < target.x + (mode === 'salvo' ? salvoW : 1) &&
    y < target.y + (mode === 'salvo' ? salvoH : 1);
  const allowed =
    target &&
    (mode === 'move'
      ? sea.moves(game).some((m) => m.x === target.x && m.y === target.y)
      : target.x + (mode === 'salvo' ? salvoW : 1) <= 12 &&
        target.y + (mode === 'salvo' ? salvoH : 1) <= 12);
  return (
    <section className="bar-naval" aria-label="Морской бой">
      <div className={`bar-naval-header${setup ? ' bar-naval-header--setup' : ''}`}>
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
                onHint?.(null);
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
                onHint?.(null);
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
          }}><span className="bar-naval-miniature" aria-hidden="true"><ShipGraphic ship={type}/></span><span>{name} ×{available.length}</span></button>;
        })}
      </div>}
      {!setup && <div className="bar-naval-fleet-status" aria-label="Остаток флота">
        {[true,false].map(self=><div key={String(self)} data-side={self?'self':'enemy'} aria-label={self?'Твой флот: остаток':'Флот противника: остаток'}><div className="bar-naval-fleet-rows">{sea.shipTypes().filter((t,i,all)=>all.findIndex(s=>shipColor(s)===shipColor(t))===i).map(type=><div className="bar-naval-fleet-row" key={shipColor(type)} aria-label={shipName(type)}>{sea.shipTypes().filter(t=>shipColor(t)===shipColor(type)).map(template=>{
          const ship=(self?game.ownShips:game.enemySunk).find(s=>s.id===template.id);
          const destroyed=!!ship&&sea.cells(ship).every(c=>ship.hits.includes(c));
          return <span key={template.id} className="bar-naval-fleet-icon" data-sunk={destroyed} data-ship-color={shipColor(template)} style={{width:template.kind==='carrier'?32:10+Math.max(template.w,template.h)*5}} title={`${shipName(template)}${destroyed?' — потоплен':''}`}><ShipGraphic ship={template}/></span>;
        })}</div>)}</div></div>)}
      </div>}
      </div>
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
          onTouchStart={(e) => {
            swipeRef.current = null;
            if (setup || countdown || impactActive || e.touches.length !== 1) return;
            const touch = e.touches[0]!;
            suppressClick.current = false;
            swipeRef.current = {x:touch.clientX,y:touch.clientY,key:boardKey};
          }}
          onTouchMove={(e) => { if (e.touches.length !== 1) swipeRef.current = null; }}
          onTouchCancel={() => { swipeRef.current = null; }}
          onTouchEnd={(e) => {
            const start = swipeRef.current;
            swipeRef.current = null;
            const touch = e.changedTouches[0];
            if (!start || !touch || start.key !== boardKey || setup || countdown || impactActive) return;
            const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
            if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
            suppressClick.current = true;
            setOwn({value:dx > 0,key:boardKey});
            setMode('shot');
            setSelected(null);
            setTarget(null);
            onHint?.(null);
          }}
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
                data-inferred-water={!hit && inferredWater.has(c)}
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
                {hit ? <span className={`bar-naval-damage${destroyed ? ' bar-naval-damage--sunk' : ''}`} aria-hidden="true" /> : mark ? <span className="bar-naval-miss" aria-hidden="true" /> : inferredWater.has(c) ? <span className="bar-naval-water" aria-hidden="true" /> : null}
                {impact && <span key={`${animationStart}-${c}`} className="bar-naval-impact" style={{animationDelay: `${effectClock.current.delay}ms`}} aria-hidden="true" />}
              </button>
            );
          })}
          {ships.map(ship=><span key={`vessel-${ship.id}`} className="bar-naval-vessel" data-side={showOwn?'self':'enemy'} data-ship-color={shipColor(ship)} aria-hidden="true" style={{left:`${ship.x/12*100}%`,top:`${ship.y/12*100}%`,width:`${ship.w/12*100}%`,height:`${ship.h/12*100}%`}}><ShipGraphic ship={ship}/></span>)}
          {!setup && showOwn && submarineSelected && !disabled && sea.moves(game).map(pos=>{
            const sub=game.ownShips.find(s=>s.kind==='submarine')!;
            const dx=pos.x-sub.x,dy=pos.y-sub.y;
            const direction=dx>0?'вправо':dx<0?'влево':dy>0?'вниз':'вверх';
            return <button key={direction} className="bar-naval-move-arrow icon-btn" aria-label={`Переместить подлодку ${direction}`} style={{left:`${(sub.x+sub.w/2+dx*(sub.w/2+0.6))/12*100}%`,top:`${(sub.y+sub.h/2+dy*(sub.h/2+0.6))/12*100}%`}} onClick={()=>{setMode('move');setTarget(pos);}}>{dx>0?'→':dx<0?'←':dy>0?'↓':'↑'}</button>;
          })}
          {!setup && showOwn && mode==='move' && target && (()=>{
            const sub=game.ownShips.find(s=>s.kind==='submarine')!;
            return <span className="bar-naval-move-preview" aria-hidden="true" style={{left:`${target.x/12*100}%`,top:`${target.y/12*100}%`,width:`${sub.w/12*100}%`,height:`${sub.h/12*100}%`}}/>;
          })()}
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
                onHint?.(null);
                setOwn({value:false,key:boardKey});
                setTarget(null);
              }}
            >
              Выстрел
            </button>
            <button
              className="btn btn--ghost bar-naval-airstrike"
              style={{'--charge': `${(game.airstrikeCharge ?? 5) * 20}%`} as CSSProperties}
              disabled={disabled || showOwn || !game.canSalvo}
              aria-pressed={!showOwn && mode === 'salvo'}
              onClick={() => {
                setMode('salvo');
                onHint?.(squareAirstrike ? 'Выбери верхний левый угол области 2×2' : 'Выбери верхний левый угол области залпа');
                setOwn({value:false,key:boardKey});
                setTarget(null);
              }}
            >
              {squareAirstrike ? <><span>Авианалёт</span><small className="bar-naval-airstrike-charge">{carrierOperational ? `Заряд ${game.airstrikeCharge! * 20}%` : 'Недоступен'}</small></> : 'Залп'}
            </button>
            <button
              className="btn btn--ghost bar-naval-maneuver"
              disabled={disabled || !submarineSelected || !sea.moves(game).length}
              aria-pressed={showOwn && mode === 'move'}
              onClick={() => {
                setMode('move');
                onHint?.(null);
                setOwn({value:true,key:boardKey});
                setTarget(null);
              }}
            >
              <span>Манёвр</span><small className="bar-naval-action-detail">{submarineOperational ? `Осталось ${game.movesLeft}` : 'Недоступен'}</small>
            </button>
            {mode === 'salvo' && !squareAirstrike && (
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

function ShipGraphic({ship}:{ship:sea.Ship}) {
  const vertical=ship.h>ship.w;
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><g transform={vertical?'rotate(90 50 50)':undefined}>
    <path className="bar-naval-hull" d={ship.kind==='carrier'?'M8 18H84L96 50L84 82H8Z':ship.kind==='submarine'?'M20 28Q-5 50 20 72H78Q105 50 78 28Z':'M8 25L72 20L96 50L72 80L8 75Z'}/>
    {ship.kind==='carrier'?<><path className="bar-naval-deck" d="M18 40H82M18 60H82"/><rect className="bar-naval-cabin" x="35" y="20" width="28" height="14"/></>:<><rect className="bar-naval-cabin" x="35" y="36" width="25" height="28" rx="5"/><path className="bar-naval-deck" d="M65 50H84M17 50H30"/></>}
  </g></svg>;
}
