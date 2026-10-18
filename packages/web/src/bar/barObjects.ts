import type {BarAction,BarOccupantId} from '@hockey/game-core';

export interface BarObject {
 id:string;character:BarOccupantId;label:string;action?:BarAction;
 left:number;top:number;width:number;height:number;
 glow:{x:number;y:number};
}
// Percentages of the full ten-bay panorama, after the wall's display transform.
// Architecture stays fixed; actions remain associated with character IDs.
export const barObjects:readonly BarObject[]=[
 {id:'dartboard',character:'daria',label:'Играть в дартс с Дарьей',action:'darts',left:1.2,top:13.8,width:4.8,height:19.6,glow:{x:3.6,y:21.5}},
 {id:'grigory-cards',character:'grigory',label:'Играть в очко с Григорием',action:'ochko',left:11.8,top:33.5,width:7.5,height:6.8,glow:{x:12.7,y:36.6}},
 {id:'maria-cards',character:'maria',label:'Играть в карты с Марией',action:'cards',left:23.8,top:33.5,width:6.2,height:6.8,glow:{x:28.5,y:36.6}},
 {id:'checkerboard',character:'arsenich',label:'Играть в шашки с Арсеничем',action:'checkers',left:33.4,top:30,width:4.8,height:17.7,glow:{x:37.3,y:34}},
 {id:'battleship',character:'timofey',label:'Играть в морской бой с Тимофеем',action:'battleship',left:61.8,top:33.8,width:2.2,height:9,glow:{x:63.5,y:36.5}},
 {id:'billiards-door',character:'veronika',label:'Играть в бильярд с Вероникой',action:'billiards',left:70.9,top:18.3,width:5,height:14.2,glow:{x:73.5,y:21.3}},
 {id:'club-cards',character:'igor',label:'Клубные карты',left:87.6,top:35.6,width:2.2,height:6.6,glow:{x:88.7,y:38.9}},
 {id:'scoreboard',character:'igor',label:'Спортивный счёт',left:87,top:13,width:2,height:8,glow:{x:88,y:17}},
];
