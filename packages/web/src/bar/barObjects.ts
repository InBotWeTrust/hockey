import type {BarAction,BarOccupantId} from '@hockey/game-core';

export interface BarObject {
 id:string;character:BarOccupantId;label:string;action?:BarAction;
 left:number;top:number;width:number;height:number;
 glow:{x:number;y:number};
}
// Percentages of the full ten-bay panorama, after the wall's display transform.
// Architecture stays fixed; actions remain associated with character IDs.
export const barObjects:readonly BarObject[]=[
 {id:'dartboard',character:'daria',label:'Играть в дартс с Дарьей',action:'darts',left:92.3,top:11.7,width:4.4,height:16.6,glow:{x:94,y:18.2}},
 {id:'grigory-cards',character:'grigory',label:'Играть в очко с Григорием',action:'ochko',left:81.8,top:28.3,width:5.5,height:5.7,glow:{x:87,y:30.9}},
 {id:'maria-cards',character:'maria',label:'Играть в карты с Марией',action:'cards',left:73.8,top:33.5,width:6.2,height:6.8,glow:{x:78.5,y:36.6}},
 {id:'checkerboard',character:'arsenich',label:'Играть в шашки с Арсеничем',action:'checkers',left:63.4,top:30,width:4.8,height:17.7,glow:{x:67.3,y:37.4}},
 {id:'battleship',character:'timofey',label:'Играть в морской бой с Тимофеем',action:'battleship',left:51.8,top:33.8,width:2.2,height:9,glow:{x:52.5,y:39}},
 {id:'billiards-door',character:'veronika',label:'Играть в бильярд с Вероникой',action:'billiards',left:32.1,top:18.3,width:5,height:14.2,glow:{x:33.1,y:29}},
 {id:'terminal',character:'online',label:'Терминал',left:44,top:35,width:2,height:14,glow:{x:45,y:42}},
 {id:'television',character:'broadcasts',label:'Телевизор',left:14,top:35,width:2,height:14,glow:{x:15,y:43}},
 {id:'club-cards',character:'igor',label:'Клубные карты',left:27.4,top:35.6,width:2.2,height:6.6,glow:{x:28.5,y:38.9}},
 {id:'scoreboard',character:'igor',label:'Спортивный счёт',left:27,top:15,width:2,height:8,glow:{x:28.7,y:21.4}},
];
