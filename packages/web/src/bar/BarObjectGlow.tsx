import type {BarOccupantId} from '@hockey/game-core';
import {barObjects} from './barObjects.js';

export function BarObjectGlow({character}:{character:BarOccupantId|null}){
 return <>{barObjects.filter(object=>object.character===character).map(object=><svg key={object.id}
  className="bar-space__object-glow bar-space__object-glow--point" data-bar-object={object.id} aria-hidden="true" viewBox="0 0 40 40"
  style={{left:`${object.glow.x}%`,top:`${object.glow.y}%`}}>
  <circle data-bar-object-glow={character} cx="20" cy="20" r="16" fill="none"/>
 </svg>)}</>;
}
