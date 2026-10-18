import type {BarAction,BarOccupantId} from '@hockey/game-core';
import {barObjects} from './barObjects.js';

export function BarGameHotspots({onAction}:{onAction:(action:BarAction,character:BarOccupantId)=>void}){
 return <>{barObjects.map(object=>{
  const action=object.action;if(!action)return null;
  return <button key={object.id} className="bar-space__game-hotspot" type="button" aria-label={object.label} data-bar-game-object={object.id}
   style={{left:`${object.left}%`,top:`${object.top}%`,width:`${object.width}%`,height:`${object.height}%`}}
   onClick={event=>{event.stopPropagation();onAction(action,object.character);}}/>;
 })}</>;
}
