import type {BarAction,BarOccupantId} from '@hockey/game-core';

export interface BarObject {
 id:string;character:BarOccupantId;label:string;action?:BarAction;
 left:number;top:number;width:number;height:number;
 glow:{x:number;y:number};
}
// Percentages of the full ten-bay panorama, after the wall's display transform.
// Architecture stays fixed; actions remain associated with character IDs.
export const barObjects:readonly BarObject[]=[
 {id:'dartboard',character:'daria',label:'Играть в дартс с Дарьей',action:'darts',left:89.2,top:12,width:5,height:22,glow:{x:91.8,y:20.5}},
 {id:'grigory-cards',character:'grigory',label:'Играть в очко с Григорием',action:'ochko',left:79.8,top:34,width:7.5,height:8,glow:{x:83.3,y:37.5}},
 {id:'maria-cards',character:'maria',label:'Играть в карты с Марией',action:'cards',left:70,top:34,width:7.5,height:8,glow:{x:72.4,y:37.5}},
 {id:'checkerboard',character:'arsenich',label:'Играть в шашки с Арсеничем',action:'checkers',left:65.6,top:8.8,width:3.8,height:19,glow:{x:67.4,y:18.5}},
 {id:'battleship',character:'timofey',label:'Играть в морской бой с Тимофеем',action:'battleship',left:51.5,top:34,width:6,height:8,glow:{x:55,y:37.5}},
 {id:'billiards-door',character:'veronika',label:'Играть в бильярд с Вероникой',action:'billiards',left:31.5,top:9,width:5.6,height:28,glow:{x:33.9,y:12.8}},
 {id:'terminal',character:'online',label:'Терминал',left:44,top:35,width:2,height:14,glow:{x:45,y:42}},
 {id:'television',character:'broadcasts',label:'Телевизор',left:14,top:35,width:2,height:14,glow:{x:15,y:52}},
 {id:'club-cards',character:'igor',label:'Клубные карты',left:27.4,top:35.6,width:2.2,height:6.6,glow:{x:28.5,y:38.9}},
 {id:'scoreboard',character:'igor',label:'Спортивный счёт',left:27,top:15,width:2,height:8,glow:{x:28.7,y:21.4}},
];
