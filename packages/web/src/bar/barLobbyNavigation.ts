import type {BarGameId} from '@hockey/game-core';
export type OnlineBarGame=BarGameId|'cards';
export function onlineBarGame(value:string|null):OnlineBarGame {
 return value==='darts'||value==='billiards'||value==='checkers'||value==='ochko'||value==='armwrestling'||value==='battleship'?value:'cards';
}
export const barLobbyPath=(kind:string|null)=>`/bar?onlineGame=${onlineBarGame(kind)}`;
