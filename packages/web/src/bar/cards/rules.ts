import { durak } from '@hockey/game-core';
export const { other, cardOrder, canBeat, activePlayer, legalActions, applyAction, timeoutAction } =
  durak;
export const createGame = (random = Math.random) => durak.createGame(random);
export type Suit = durak.Suit;
export type Player = durak.Player;
export type Card = durak.Card;
export type Pair = durak.Pair;
export type Action = durak.Action;
export type Game = durak.Game;
