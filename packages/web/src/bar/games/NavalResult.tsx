import { useState } from 'react';
import { barBattleship as sea } from '@hockey/game-core';
import { ShipGraphic, SubmarineWrecks } from './BattleshipField.js';
const letters = 'АБВГДЕЖЗИКЛМ';
export function NavalResult({ game, player }: { game: sea.View; player: 0 | 1 }) {
  const [open, setOpen] = useState(false);
  const reveal = game.enemyReveal;
  if (game.winner === null || !reveal) return null;
  const wrecks=reveal.ships.flatMap(s=>s.wreck===undefined?[]:[s.wreck]);
  const sunkWrecks=reveal.ships.filter(s=>sea.cells(s).every(c=>s.hits.includes(c))).flatMap(s=>s.wreck===undefined?[]:[s.wreck]);
  const water=new Set(sea.surroundingWater(reveal.ships.filter(s=>sea.cells(s).every(c=>s.hits.includes(c)))));
  const trail=(reveal.submarineTrail??[]).map(ship=>{
    const live=sea.cells(ship).filter(c=>!ship.hits.includes(c));
    return ship.w*ship.h===2 && live.length===1 ? {...ship,x:live[0]!%12,y:Math.floor(live[0]!/12),w:1,h:1,hits:[]} : ship;
  });
  const position = (ship: sea.Ship) => ({ left: `${ship.x / 12 * 100}%`, top: `${ship.y / 12 * 100}%`, width: `${ship.w / 12 * 100}%`, height: `${ship.h / 12 * 100}%` });
  return <section className="bar-naval-review">
    <button className="bar-naval-review-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>Посмотреть поле соперника<span aria-hidden="true">{open ? '▴' : '▾'}</span></button>
    {open && <>
      <div className="bar-naval-grid">
        <span aria-hidden="true"/>
        <div className="bar-naval-columns" aria-hidden="true">{Array.from(letters).map(letter => <span key={letter}>{letter}</span>)}</div>
        <div className="bar-naval-rows" aria-hidden="true">{Array.from({length:12},(_,i)=><span key={i}>{i+1}</span>)}</div>
        <div className="bar-naval-board" role="group" aria-label="Расстановка соперника">
          {Array.from({length:144},(_,cell)=>{
            const ship = reveal.ships.find(s => sea.cells(s).includes(cell));
            const mark = game.shots[player].find(m => m.cell === cell);
            const hit = ship?.hits.includes(cell) || mark?.hit || wrecks.includes(cell);
            const destroyed = (!!ship && sea.cells(ship).every(c => ship.hits.includes(c))) || sunkWrecks.includes(cell);
            return <span key={cell} className="bar-naval-cell" data-hit={!!hit} data-sunk={destroyed} aria-label={`${letters[cell%12]} ${Math.floor(cell/12)+1}${hit?' попадание':mark?' промах':''}`}>
              {hit ? <span className={`bar-naval-damage${destroyed?' bar-naval-damage--sunk':' bar-naval-damage--burning'}${!destroyed&&wrecks.includes(cell)?' bar-naval-damage--abandoned':''}`}/> : mark || (game.mobileSubmarines && water.has(cell)) ? <span className="bar-naval-miss"/> : null}
            </span>;
          })}
          <SubmarineWrecks positions={wrecks} sunk={sunkWrecks}/>
          {trail.map((ship, index, trail) => <span key={ship.move} className="bar-naval-vessel bar-naval-vessel--trail" style={position(ship)} aria-label={`Подлодка до манёвра ${ship.move}`}><ShipGraphic ship={ship}/><>{index>0&&<b className="bar-naval-position-number" style={{ left: trail.slice(0, index).filter(previous => previous.x === ship.x && previous.y === ship.y).length * 18 }}>{trail[index-1]!.move}</b>}</></span>)}
          {reveal.ships.map(ship => <span key={ship.id} className="bar-naval-vessel" data-sunk={sea.cells(ship).every(cell => ship.hits.includes(cell))} style={position(ship)} aria-hidden="true"><ShipGraphic ship={ship}/>{ship.kind==='submarine'&&trail.length>0&&<b className="bar-naval-position-number">{trail[trail.length-1]!.move}</b>}</span>)}
        </div>
      </div>
      <p className="modal-copy">{game.phase === 'setup' ? 'Игра закончилась до завершения расстановки. Показаны размещённые корабли.' : 'Твои попадания и промахи, все корабли соперника. Огонь - подбит, крест - потоплен.'}</p>
      {wrecks.length>0 && <p className="modal-copy">Маленький огонь - оставленная часть подлодки.</p>}
      {reveal.submarineTrail === undefined ? <p className="modal-copy">История перемещений в этой партии не записывалась.</p> : reveal.submarineTrail.length > 0 ? <p className="modal-copy">Пунктирный силуэт - исходная позиция. Цифра отмечает, куда подлодка переместилась. Сплошная подлодка - последнее положение.</p> : null}
    </>}
  </section>;
}
