import type {CityTimeOfDay} from '../city/lighting.js';
import {barFloor,barInterior,barParts} from './barArtwork.js';
import './bar-interior-backdrop.css';

/** Original generated images, with one continuous floor below the wall sections. */
export function BarInteriorBackdrop({phase,previous}:{phase:CityTimeOfDay;previous:CityTimeOfDay|null}){
 return <>{previous && <InteriorFrame phase={previous}/>}<InteriorFrame key={phase} phase={phase} entering={previous!==null}/></>;
}
function InteriorFrame({phase,entering=false}:{phase:CityTimeOfDay;entering?:boolean}){
 return <div className={`bar-interior-backdrop${entering?' bar-space__background--enter':''}`} aria-hidden="true">
  <img className="bar-interior-backdrop__floor" data-bar-floor src={barFloor(phase)} alt="" draggable={false}/>
  {barParts.map(part=><div key={part} className={`bar-interior-backdrop__wall bar-interior-backdrop__wall--${part}`} data-bar-wall={part}>
   <img src={barInterior(part,phase)} alt="" draggable={false}/>
  </div>)}
 </div>;
}
