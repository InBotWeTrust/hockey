import { afterEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/authStore.js';
import { coalesceLobbyRequest } from './lobbyRequest.js';
afterEach(()=>{useAuthStore.setState({user:null,accessToken:null});});
it('shares an unfinished lobby read and allows a new request after completion',async()=>{
 let resolve!:(value:string)=>void;
 const read=vi.fn(()=>new Promise<string>(done=>{resolve=done;}));
 const a=coalesceLobbyRequest('games',read),b=coalesceLobbyRequest('games',read);
 expect(read).toHaveBeenCalledOnce();resolve('snapshot');
 expect(await a).toBe('snapshot');expect(await b).toBe('snapshot');
 const c=coalesceLobbyRequest('games',read);expect(read).toHaveBeenCalledTimes(2);resolve('fresh');await c;
});
it('does not reuse another session or another lobby request',async()=>{
 const read=vi.fn(async()=>({invites:[]}));
 useAuthStore.setState({accessToken:'first-session'});
 const a=coalesceLobbyRequest('games',read);
 useAuthStore.setState({accessToken:'second-session'});
 const b=coalesceLobbyRequest('games',read),c=coalesceLobbyRequest('cards',read);
 expect(read).toHaveBeenCalledTimes(3);await Promise.all([a,b,c]);
});
