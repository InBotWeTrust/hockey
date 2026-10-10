import { apiFetch } from '../../api/apiFetch.js';
import type { durakTable } from '@hockey/game-core';
import type { Card, Suit, Pair } from './rules.js';
export type RoomView = {
  id: string;
  owner: string;
  capacity: number;
  formats?: number[];
  readyUntil?: number | null;
  status: 'waiting' | 'confirming' | 'countdown' | 'playing' | 'ended';
  searchUntil: number | null;
  countdownAt: number | null;
  proposed: boolean;
  ready: string[];
  revision: number;
  serverNow: number;
  pending: string[];
  invitations?: { id: string; userId: string; displayName: string }[];
  left?: boolean;
  seats: {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    count: number;
    status: string;
  }[];
  game: null | {
    player: number;
    hand: Card[];
    deckCount: number;
    trump: Suit;
    trumpCard: Card;
    attacker: number;
    defender: number;
    turn: number;
    table: Pair[];
    phase: 'attack' | 'defend' | 'throw' | 'ended';
    taking: boolean;
    deadline: number | null;
    actions: durakTable.TableAction[];
    result: string | null;
  };
};
export type RoomCommand =
  | { type: 'leave' | 'renew' | 'pause' | 'propose' | 'ready' }
  | { type: 'move'; action: durakTable.TableAction };
export const joinRoom = (capacity: number | number[], searching = true) =>
  apiFetch<{ roomId: string }>('/bar/cards/rooms', {
    method: 'POST',
    body: JSON.stringify({ capacity, searching }),
  });
export const readRoom = (id: string) => apiFetch<RoomView>(`/bar/cards/rooms/${id}`);
export const roomCommand = (id: string, revision: number, command: RoomCommand) =>
  apiFetch<RoomView>(`/bar/cards/rooms/${id}`, {
    method: 'POST',
    body: JSON.stringify({ revision, command }),
  });
export const roomInvite = (id: string, userId: string) =>
  apiFetch(`/bar/cards/rooms/${id}/invites`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
