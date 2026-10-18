import type { BarAction, BarOccupantId } from '@hockey/game-core';

const objects = [
  {x:100,y:65,w:70,h:150,action:'darts',character:'daria',label:'Играть в дартс с Дарьей'},
  {x:488,y:239,w:58,h:71,action:'ochko',character:'grigory',label:'Играть в очко с Григорием'},
  {x:856,y:211,w:91,h:77,action:'cards',character:'maria',label:'Играть в карты с Марией'},
  {x:1540,y:260,w:70,h:73,action:'checkers',character:'arsenich',label:'Играть в шашки с Арсеничем'},
] as const;

export function BarGameHotspots({onAction}: {onAction:(action:BarAction,character:BarOccupantId)=>void}) {
  const groups = [objects,[{x:1420,y:30,w:190,h:480,action:'billiards',character:'veronika',label:'Играть в бильярд с Вероникой'}] as const];
  return <>{groups.map((group,index)=><svg key={index} className="bar-space__game-hotspots" viewBox="0 0 1717 916" preserveAspectRatio="xMidYMid slice" style={{left:`${index*40}%`}}>
    {group.map(object=><rect key={object.character} x={object.x} y={object.y} width={object.w} height={object.h} fill="transparent" role="button" tabIndex={0} aria-label={object.label}
      onClick={e=>{e.stopPropagation();onAction(object.action,object.character);}}
      onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();onAction(object.action,object.character);}}}/>) }
  </svg>)}</>;
}
