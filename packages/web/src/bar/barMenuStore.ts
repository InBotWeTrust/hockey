import {create} from 'zustand';
import type {BarGameLobby} from '@hockey/game-core';
import type {Lobby} from './cards/onlineApi.js';
export const useBarMenuStore=create<{
 games:{owner:string;data:BarGameLobby}|null;cards:{owner:string;data:Lobby}|null;
 setGames:(owner:string,data:BarGameLobby)=>void;setCards:(owner:string,data:Lobby)=>void;
}>(set=>({games:null,cards:null,setGames:(owner,data)=>set({games:{owner,data}}),setCards:(owner,data)=>set({cards:{owner,data}})}));
