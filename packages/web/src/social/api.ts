import { apiFetch } from '../api/apiFetch.js';
import type { DailyGameStats } from '../api/duel.js';
import type { TrainingHistorySession } from '../api/training.js';
import type { ProfileAchievement } from '../screens/profileTypes.js';

export interface SocialUser { id: string; displayName: string; avatarUrl: string | null; visible?: boolean }
export interface FanSummary { followersCount: number; followingCount: number; following: boolean; canFollow: boolean }
export interface SocialPage<T> { items: T[]; nextCursor: string | null }
export interface FanHistoryItem extends SocialUser { userId: string; action: 'follow' | 'unfollow' | 'remove'; occurredAt: string }
export interface ActivityParticipant { userId: string; goals?: number; shots?: number; score?: number; durationMs?: number; points?: number; side?: string; outcome?:'win'|'loss'|'draw' }
export type ActivityKind = 'daily'|'training'|'initial_course'|'advanced_course'|'achievement'|'regular'|'playoff'|'duel'|'bar_fight'|'bar_cards'|'membership';
export interface ActivityEvent {
 unread?:boolean;
 reactions?:Array<{emoji:string;count:number;reactedByMe:boolean}>;
 id: string; kind: ActivityKind; occurredAt: string; actors: SocialUser[];
 data: {
  daily?: DailyGameStats; training?: TrainingHistorySession; achievement?: ProfileAchievement;
  participants?: ActivityParticipant[]; winnerId?: string|null; outcome?: string|null; reason?: string|null;
  format?: 'express'|'express_plus'|'classic'|'sniper'|'marathon'|'rhythm'; matchId?: string;
  rules?: {totalPeriods?: number}; character?: string; blockedUntil?: string|null; timezone?: string;
  game?: string; surrendered?: boolean; exercises?: number; stage?: number|null;
  tournamentTitle?: string; day?: number; seriesScore?: {home:number;away:number;homeId:string;awayId:string};
  seriesCompleted?:boolean; seriesWinnerId?:string|null; roundName?:string|null; seriesKind?:string;
  action?:'follow'|'unfollow'|'remove';
  games?: Array<{homeId:string;awayId:string;homeScore:number;awayScore:number;outcome:string|null}>;
 };
}
export interface SocialApi {
 feedUnread():Promise<FeedReadStatus>;
 readFeed(input:{ids:string[]}|{through:string}):Promise<FeedReadStatus>;
 reactions(ids:string[]):Promise<Array<{id:string;reactions:NonNullable<ActivityEvent['reactions']>}>>;
 fanRating(cursor?:string):Promise<SocialPage<SocialUser&{count:number;place:number}>&{currentUser?:SocialUser&{count:number;place:number}|null}>;
 react(eventId:string,emoji:string,remove:boolean):Promise<ActivityEvent>;
 bio(userId:string):Promise<{bio:string}>;
 saveBio(bio:string):Promise<{bio:string}>;
 profile(userId:string):Promise<SocialUser>;
 removeFan(userId:string):Promise<FanSummary>;
 summary(userId:string):Promise<FanSummary>;
 follow(userId:string,following:boolean):Promise<FanSummary>;
 people(userId:string,list:'fans'|'following',cursor?:string):Promise<SocialPage<SocialUser>>;
 membershipHistory(cursor?:string):Promise<SocialPage<FanHistoryItem>>;
 feed(cursor?:string):Promise<SocialPage<ActivityEvent>>;
 history(userId:string,cursor?:string):Promise<SocialPage<ActivityEvent>>;
 event(eventId:string):Promise<ActivityEvent>;
}
const query=(cursor?:string)=>cursor?`?cursor=${encodeURIComponent(cursor)}`:'';
export interface FeedReadStatus { hasUnread:boolean; unreadCount:number; asOf:string }
export const socialApi:SocialApi={
 feedUnread:()=>apiFetch('/social/feed/unread'),
 readFeed:input=>apiFetch('/social/feed/read',{method:'POST',body:JSON.stringify(input)}),
 reactions:ids=>apiFetch('/social/reactions',{method:'POST',body:JSON.stringify({ids})}),
 fanRating:cursor=>apiFetch(`/social/fans/rating${query(cursor)}`),
 react:(id,emoji,remove)=>apiFetch(`/social/events/${id}/reaction`,{method:remove?'DELETE':'PUT',body:JSON.stringify({emoji})}),
 bio:id=>apiFetch(`/users/${id}/bio`),
 saveBio:bio=>apiFetch('/me/bio',{method:'PUT',body:JSON.stringify({bio})}),
 profile:id=>apiFetch(`/users/${id}`),
 removeFan:id=>apiFetch(`/me/fans/${id}`,{method:'DELETE'}),
 summary:id=>apiFetch(`/users/${id}/fans/summary`),
 follow:(id,following)=>apiFetch(`/users/${id}/fan`,{method:following?'PUT':'DELETE'}),
 people:(id,list,cursor)=>apiFetch(`/users/${id}/${list}${query(cursor)}`),
 membershipHistory:cursor=>apiFetch(`/me/fan-history${query(cursor)}`),
 feed:cursor=>apiFetch(`/social/feed${query(cursor)}`),
 history:(id,cursor)=>apiFetch(`/users/${id}/activity${query(cursor)}`),
 event:id=>apiFetch(`/social/events/${id}`),
};
