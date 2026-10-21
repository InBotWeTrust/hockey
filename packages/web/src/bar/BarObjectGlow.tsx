import {barObjects} from './barObjects.js';

export function BarObjectGlow(){
 return <>{barObjects.map(object=><svg key={object.id}
  className={`bar-space__object-glow bar-space__object-glow--point${['online','broadcasts','grigory','timofey'].includes(object.character) ? ' bar-space__object-glow--foreground' : ''}`} data-bar-object={object.id} aria-hidden="true" viewBox="0 0 40 40"
  style={{left:`${object.glow.x}%`,top:`${object.glow.y}%`}}>
  <circle data-bar-object-glow={object.character} cx="20" cy="20" r="16" fill="none"/>
 </svg>)}</>;
}
