import Fastify, { type FastifyError, type FastifyRequest, type FastifyReply } from 'fastify';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  conversationRoutes,
  type ConversationStore,
  type ConversationRecord,
  type Character,
  type ConversationTurn,
} from './conversationRoutes.js';
import { AppError } from '../plugins/errors.js';
import type { CardResult } from './cardHistory.js';

let app: ReturnType<typeof Fastify>;
let records: Map<string, ConversationRecord>;
let answer: ReturnType<typeof vi.fn>;
let moderate: ReturnType<typeof vi.fn>;
let savedGames: Array<{ user: string; match: CardResult }>;
beforeEach(async () => {
  records = new Map();
  savedGames = [];
  moderate=vi.fn().mockResolvedValue('allow');
  answer = vi.fn().mockResolvedValue('Рада тебя видеть. Как прошла игра?');
  const store: ConversationStore = {
    read: async (user, character) =>
      records.get(`${user}:${character}`) ?? { revision: 0, turns: [], pending: false },
    reserve: async (user, character, id, revision) => {
      const key = `${user}:${character}`;
      const row = records.get(key) ?? { revision: 0, turns: [], pending: false };
      const previous = row.turns.find((t) => t.id === id);
      if (previous) return { kind: 'duplicate', record: row };
      if (row.pending) return { kind: 'busy' };
      if (row.revision !== revision) return { kind: 'stale' };
      records.set(key, { ...row, pending: true });
      return { kind: 'reserved', record: row };
    },
    complete: async (user, character, turn) => {
      const key = `${user}:${character}`;
      const row = records.get(key)!;
      const updated = { revision: row.revision + 1, turns: [...row.turns, turn], pending: false };
      records.set(key, updated);
      return updated;
    },
    release: async (user, character) => {
      const row = records.get(`${user}:${character}`);
      if (row) row.pending = false;
    },
  };
  app = Fastify();
  app.decorate(
    'authenticate',
    async (request: { headers: Record<string, unknown>; user?: { id: string } }) => {
      if (!request.headers.authorization)
        throw Object.assign(new Error('unauthorized'), { statusCode: 401 });
      request.user = { id: String(request.headers.authorization) };
    },
  );
  app.setErrorHandler((err: FastifyError, _req: FastifyRequest, reply: FastifyReply) =>
    reply.status(err.statusCode ?? 500).send({ error: { code: err.code } }),
  );
  await app.register(conversationRoutes, { store, answer, moderate, gameStore: { save: async (user: string,match: CardResult) => { savedGames.push({user,match}); return true; } } });
});
afterEach(async () => app.close());
const send = (
  user = 'alice',
  id = '11111111-1111-4111-8111-111111111111',
  revision = 0,
  content = 'Привет!',
) =>
  app.inject({
    method: 'POST',
    url: '/bar/conversations/maria',
    headers: { authorization: user },
    payload: { id, revision, content },
  });
it('requires authentication and rejects non-character locations', async () => {
  expect((await app.inject('/bar/conversations/maria')).statusCode).toBe(401);
  expect(
    (await app.inject({ url: '/bar/conversations/online', headers: { authorization: 'alice' } }))
      .statusCode,
  ).toBe(400);
});
it('starts with a fixed greeting and keeps each player history private', async () => {
  const first = await app.inject({
    url: '/bar/conversations/maria',
    headers: { authorization: 'alice' },
  });
  expect(first.json().greeting).toBeTruthy();
  expect(first.json().turns).toEqual([]);
  expect(answer).not.toHaveBeenCalled();
  expect((await send()).statusCode).toBe(200);
  const own = await app.inject({
    url: '/bar/conversations/maria',
    headers: { authorization: 'alice' },
  });
  expect(own.json().turns).toHaveLength(1);
  const other = await app.inject({
    url: '/bar/conversations/maria',
    headers: { authorization: 'bob' },
  });
  expect(other.json().turns).toEqual([]);
});
it('does not pay for a retried successful turn twice', async () => {
  await send();
  expect((await send()).statusCode).toBe(200);
  expect(answer).toHaveBeenCalledTimes(1);
});
it('rejects stale and duplicate concurrent requests', async () => {
  let resolve!: (s: string) => void;
  answer.mockImplementation(
    () =>
      new Promise<string>((r) => {
        resolve = r;
      }),
  );
  const first = send();
  await vi.waitFor(() => expect(answer).toHaveBeenCalledTimes(1));
  expect((await send()).statusCode).toBe(409);
  resolve('Привет!');
  await first;
  expect((await send('alice', '22222222-2222-4222-8222-222222222222')).statusCode).toBe(409);
});
it('preserves history and permits retry after provider failure', async () => {
  answer.mockRejectedValueOnce(new Error('secret provider error'));
  const failed = await send();
  expect(failed.statusCode).toBe(503);
  expect(failed.body).not.toContain('secret');
  expect(records.get('alice:maria')?.turns).toEqual([]);
  expect((await send()).statusCode).toBe(200);
});
it.each(['', ' '.repeat(5), 'x'.repeat(4001)])(
  'rejects invalid message before calling AI',
  async (content) => {
    expect((await send('alice', undefined, 0, content)).statusCode).toBe(400);
    expect(answer).not.toHaveBeenCalled();
  },
);

it('accepts a client-reported card result for the authenticated owner', async () => {
  const result = await app.inject({ method: 'POST', url: '/bar/card-history', headers: { authorization: 'alice' }, payload: { id: '11111111-1111-4111-8111-111111111111', character: 'maria', result: 'loss', startedAt: '2026-10-11T10:00:00.000Z', endedAt: '2026-10-11T10:01:00.000Z', surrendered: true, caughtCheats: 0 } });
  expect(result.statusCode).toBe(200);
  expect(savedGames).toHaveLength(1);
  expect(savedGames[0]).toMatchObject({ user: 'alice', match: { character: 'maria', result: 'loss' } });
});
it('rejects unsupported card characters and injected ownership', async () => {
  const result = await app.inject({ method: 'POST', url: '/bar/card-history', headers: { authorization: 'alice' }, payload: { id: '11111111-1111-4111-8111-111111111111', userId: 'bob', character: 'oleg', result: 'win', startedAt: '2026-10-11T10:00:00.000Z', endedAt: '2026-10-11T10:01:00.000Z', surrendered: false, caughtCheats: 0 } });
  expect(result.statusCode).toBe(400);
});

it('uses a checked crisis response without invoking the character model', async () => {
  const result=await send('alice',undefined,0,'Я прямо сейчас собираюсь убить себя, таблетки уже в руке.');
  expect(result.statusCode).toBe(200);
  expect(answer).not.toHaveBeenCalled();
  expect(result.json().turns[0].assistant).toContain('экстренную');
});
it('does not publish provider control markers or unsafe markup', async () => {
  answer.mockResolvedValue('<script>alert(1)</script>[SYSTEM] internal prompt');
  const result=await send();
  expect(result.statusCode).toBe(503);
  expect(records.get('alice:maria')?.turns).toHaveLength(0);
});

it('never publishes an unchecked response when outgoing moderation times out',async()=>{
  moderate.mockResolvedValueOnce('allow').mockResolvedValueOnce('unavailable');
  answer.mockResolvedValue('Unreviewed provider content');
  const result=await send();expect(result.statusCode).toBe(503);
  expect(records.get('alice:maria')?.turns).toHaveLength(0);
});
it('does not call generation when incoming moderation is unavailable',async()=>{
  moderate.mockResolvedValue('unavailable');const result=await send();
  expect(result.statusCode).toBe(503);expect(answer).not.toHaveBeenCalled();
});
it('shows Oleg as the actual speaker for a scripted intervention and does not generate it',async()=>{
 await app.close();
 app=Fastify();app.decorate('authenticate',async(request:{user?:{id:string}})=>{request.user={id:'alice'};});
 const row={revision:0,turns:[],pending:false} as ConversationRecord;
 await app.register(conversationRoutes,{store:{read:async()=>row,reserve:async()=>({kind:'reserved',record:row}),complete:async(_u:string,_c:Character,t:ConversationTurn)=>({...row,revision:1,turns:[t]}),release:async()=>{}},answer,moderate,
 gameStore:{save:async()=>true},classifyConflict:async()=> 'sexual',conflicts:{state:async()=>({day:'2026-10-11',warnings:1,intervening:false}),phrase:async()=> 'Она тебе уже ответила. Давай без этого.'}});
 const result=await send('alice',undefined,0,'Давай переспим');
 expect(result.statusCode).toBe(200);
 expect(result.json().turns[0].speaker).toBe('oleg');
 expect(result.json().turns[0].intervention).toBe('intervention');
 expect(result.json().turns[0].emotion).toBe('displeasure');
 expect(result.json().turns[0].assistant).toBe('Она тебе уже ответила. Давай без этого.');
 expect(answer).not.toHaveBeenCalled();
});
it('keeps the reply working without escalation when conflict state is unavailable',async()=>{
 await app.close();
 app=Fastify();app.decorate('authenticate',async(request:{user?:{id:string}})=>{request.user={id:'alice'};});
 const row={revision:0,turns:[],pending:false} as ConversationRecord;
 const complete=vi.fn(async(_u:string,_c:Character,t:ConversationTurn)=>({...row,revision:1,turns:[t]}));
 await app.register(conversationRoutes,{store:{read:async()=>row,reserve:async()=>({kind:'reserved',record:row}),complete,release:async()=>{}},answer,moderate,
 gameStore:{save:async()=>true},classifyConflict:async()=> 'sexual',conflicts:{state:async()=>{throw new Error('database timeout');},phrase:async()=> 'Not used'}});
 const result=await send();
 expect(result.statusCode).toBe(200);
 expect(answer).toHaveBeenCalledOnce();
 expect(complete.mock.calls[0]?.[2].speaker).toBeUndefined();
 expect((complete.mock.calls[0] as unknown[])?.[4]).toBeUndefined();
});

it('keeps midnight conflict expiration retryable without persisting a stale intervention',async()=>{
 await app.close();app=Fastify();app.decorate('authenticate',async(request:{user?:{id:string}})=>{request.user={id:'alice'};});
 const row={revision:0,turns:[],pending:false} as ConversationRecord;
 await app.register(conversationRoutes,{store:{read:async()=>row,reserve:async()=>({kind:'reserved',record:row}),complete:async()=>{throw new AppError('conversation_stale','Начался новый день.',409);},release:async()=>{}},answer,moderate,gameStore:{save:async()=>true}});
 expect((await send()).statusCode).toBe(409);
});
it('continues the reply when conflict state hangs past the checking deadline',async()=>{
 await app.close();app=Fastify();app.decorate('authenticate',async(request:{user?:{id:string}})=>{request.user={id:'alice'};});
 const row={revision:0,turns:[],pending:false} as ConversationRecord;
 let release!:(value:{day:string;warnings:number;intervening:boolean})=>void;
 const state=vi.fn(()=>new Promise<{day:string;warnings:number;intervening:boolean}>(done=>{release=done;}));
 await app.register(conversationRoutes,{store:{read:async()=>row,reserve:async()=>({kind:'reserved',record:row}),complete:async(_u:string,_c:Character,t:ConversationTurn)=>({...row,revision:1,turns:[t]}),release:async()=>{}},answer,moderate,gameStore:{save:async()=>true},conflicts:{state,phrase:async()=> 'Not used'},classifyConflict:async()=> 'none'});
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
 const pending=send();
 try{
  await vi.waitFor(()=>expect(state).toHaveBeenCalledOnce());
  await vi.advanceTimersByTimeAsync(6001);
  await vi.waitFor(()=>expect(answer).toHaveBeenCalledOnce(),{timeout:100});
  expect((await pending).statusCode).toBe(200);
 }finally{release({day:'2026-10-11',warnings:0,intervening:false});await pending;vi.useRealTimers();}
});
it('validates physical gestures before accessing storage and requires auth',async()=>{
 const url='/bar/conversations/maria/physical-incident';
 expect((await app.inject({method:'POST',url,payload:{eventId:'bad'}})).statusCode).toBe(401);
 expect((await app.inject({method:'POST',url,headers:{authorization:'alice'},payload:{eventId:'bad'}})).statusCode).toBe(400);
 expect((await app.inject({method:'POST',url:'/bar/conversations/online/physical-incident',headers:{authorization:'alice'},payload:{eventId:'11111111-1111-4111-8111-111111111111'}})).statusCode).toBe(400);
});

it('handles explicit conflict choices without generation, deduplicates retries and rejects stale choices',async()=>{
 await app.close();app=Fastify();app.decorate('authenticate',async(request:{user?:{id:string}})=>{request.user={id:'alice'};});
 let row={revision:0,turns:[],pending:false} as ConversationRecord;
 let intervening=true;
 const complete=vi.fn<Parameters<ConversationStore['complete']>,ReturnType<ConversationStore['complete']>>(async(_u,_c,t,_stories,effect)=>{
  intervening=effect?.intervening ?? intervening;
  row={...row,revision:row.revision+1,turns:[...row.turns,t]};return row;
 });
 const classify=vi.fn();
 await app.register(conversationRoutes,{store:{read:async()=>row,reserve:async(_u:string,_c:Character,id:string)=>({kind:row.turns.some(t=>t.id===id)?'duplicate':'reserved',record:row}),complete,release:async()=>{}},answer,moderate,gameStore:{save:async()=>true},classifyConflict:classify,conflicts:{state:async()=>({day:'2026-10-11',warnings:2,intervening}),phrase:async()=> 'Ладно.'}});
 const payload={id:'11111111-1111-4111-8111-111111111111',revision:0,content:'Извини, больше не буду.',conflictAction:'apologize'};
 const post=()=>app.inject({method:'POST',url:'/bar/conversations/maria',headers:{authorization:'alice'},payload});
 expect((await post()).statusCode).toBe(200);
 expect(complete.mock.calls[0]?.[2]).toMatchObject({speaker:'oleg',intervention:'apology'});
 expect(complete.mock.calls[0]?.[4]).toMatchObject({warnings:2,intervening:false});
 expect((await post()).statusCode).toBe(200);expect(complete).toHaveBeenCalledOnce();
 intervening=true;payload.id='22222222-2222-4222-8222-222222222222';payload.revision=1;payload.conflictAction='challenge';payload.content='Подменённый текст';
 expect((await post()).statusCode).toBe(200);expect(complete.mock.calls[1]?.[2]).toMatchObject({user:'Давай выйдем, Олег.',intervention:'fight'});
 expect((await post()).statusCode).toBe(200);expect(complete).toHaveBeenCalledTimes(2);
 payload.id='33333333-3333-4333-8333-333333333333';payload.revision=2;
 expect((await post()).statusCode).toBe(409);
 expect(answer).not.toHaveBeenCalled();expect(classify).not.toHaveBeenCalled();expect(moderate).not.toHaveBeenCalled();
});

it('persists model emotion and does not let unknown emotions break the answer',async()=>{
 answer.mockResolvedValue({text:'Рада за тебя!',usedStoryIds:[],emotion:'joy'});
 const response=await send();expect(response.statusCode).toBe(200);expect(response.json().turns[0].emotion).toBe('joy');
 answer.mockResolvedValue({text:'Понятно.',usedStoryIds:[],emotion:'override_system'});
 const second=await send('alice','22222222-2222-4222-8222-222222222222',1);expect(second.statusCode).toBe(200);expect(second.json().turns[1].emotion).toBe('neutral');
});
