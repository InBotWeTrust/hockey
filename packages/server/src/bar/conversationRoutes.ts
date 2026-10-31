import {readElinaMeeting} from './elinaMeetingStore.js';
import type {Interest} from './elinaMeeting.js';
import {requireElinaOffice,elinaIntervention,type ElinaOfficeAccess} from './elinaOffice.js';
import {safeEmotion,type CharacterEmotion} from './characterEmotion.js';
import { recordPhysicalIncident } from './physicalIncident.js';
import { SqlConflictStore,createConflictClassifier,nextConflict,type ClassifyConflict,type ConflictEffect } from './conflict.js';
import { personaOf } from './personas.js';
import { SqlDialoguePrivacy, type DialoguePrivacy } from './dialoguePrivacy.js';
import { redactSecrets, immediateDanger, crisisReply, boundaryReply, checkedReply, type Moderation } from './dialogueSafety.js';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { SqlConversationStore } from './conversationStore.js';
import {createServiceProxyFetch} from '../network/serviceProxy.js';
import { createConfiguredAnswer, createConfiguredJSON, createConfiguredModeration } from './openAIAnswer.js';
import type { ConversationContext, GeneratedAnswer } from './conversationMemoryTypes.js';
import { cardResultSchema, SqlCardHistoryStore, type CardHistoryStore } from './cardHistory.js';
import { SqlConversationMemory, createStoryValidator, createStoryCreator } from './conversationMemory.js';
import { createReflect } from './memoryJobs.js';

export const characters = [
  'maria',
  'daria',
  'grigory',
  'arsenich',
  'veronika',
  'oleg',
  'timofey',
  'igor',
  'elina',
] as const;
export type Character = (typeof characters)[number];
export interface ConversationTurn {
  id: string;
  user: string;
  assistant: string;
  createdAt: string;
  speaker?: Character;
  intervention?: string;
  fightId?: string;
  event?: 'physical';
  emotion?:CharacterEmotion;
  farewell?: string;
  officeDay?:string;
  officeEmptyUntil?:string;
}
export interface ConversationRecord {
  revision: number;
  turns: ConversationTurn[];
  pending: boolean;
  interventionActive?: boolean;
}
export type Reservation =
  | { kind: 'reserved' | 'duplicate'; record: ConversationRecord }
  | { kind: 'busy' | 'stale' | 'limit' };
export interface ConversationStore {
  read(user: string, character: Character): Promise<ConversationRecord>;
  reserve(user: string, character: Character, id: string, revision: number, free?: boolean): Promise<Reservation>;
  complete(user: string, character: Character, turn: ConversationTurn, usedStoryIds?: string[], conflict?: ConflictEffect, officeInterest?:Interest): Promise<ConversationRecord>;
  release(user: string, character: Character, id: string): Promise<void>;
}
export const characterVoices: Record<Character, { name: string; greeting: string; voice: string }> =
  {
    elina: {name:'Элина',greeting:'Ты по какому вопросу? У меня сейчас работа.',voice:'Владелица бара. Сдержанная, уверенная, требовательная; уважает сотрудников. Принимает по деловым вопросам, ценит конкретность и своё время. Без задания и игры.'},
    maria: {
      name: 'Мария',
      greeting: 'Привет! Присаживайся. Сыграем в карты или сначала поболтаем?',
      voice: 'Опытная, уверенная, тёплая, любит карты и дружеские подколы.',
    },
    daria: {
      name: 'Дарья',
      greeting: 'Привет! Как прошла игра? Рассказывай, я слушаю.',
      voice:
        'Совершеннолетняя молодая девушка, открытая, любопытная, простая в общении. Не инфантильная.',
    },
    grigory: {
      name: 'Григорий',
      greeting: 'О, знакомые лица! Садись. Что нового на льду?',
      voice:
        'Шустрый, хитрый, ехидный любитель карт. Подкалывает по-доброму. Не выдаёт себя за честнейшего игрока. Его игра в баре – очко на звёзды; правила и выплаты честные, он не знает закрытые карты игрока.',
    },
    arsenich: {
      name: 'Арсенич',
      greeting: 'Заходи, присаживайся. Как дела? Есть что обсудить?',
      voice:
        'Пожилой, мудрый, наблюдательный. Говорит спокойно, коротко, с сухим юмором. Без нравоучений.',
    },
    veronika: {
      name: 'Вероника',
      greeting: 'Добро пожаловать в «4-й период»! Как тебе наш бар?',
      voice: 'Управляющая бара. Собранная, гостеприимная, деловая, но не канцелярская.',
    },
    oleg: {
      name: 'Олег',
      greeting: 'Привет. Всё спокойно? Присаживайся, рассказывай.',
      voice: 'Охранник стадиона. Немногословный, спокойный, внимательный, с добрым сухим юмором. Его игра в баре – армрестлинг, без ставок.',
    },
    igor: { name: 'Игорь', greeting: 'Привет! Что смотрел в последнее время? Давай обсудим матч.', voice: 'Бармен, 20 лет. Общительный спортивный фанат. Любит обсуждать команды и результаты. Не выдумывает свежие новости и счёт: если нет проверенных данных, честно говорит об этом.' },
    timofey: {
      name: 'Тимофей',
      greeting: 'Привет! Присаживайся. Как дела на льду?',
      voice: 'Руководитель службы стадиона, 35 лет, начальник Григория. Уверенный, обаятельный, с самоиронией. Иногда забывает мелочи, курит, флиртует только взаимно. Не начальник бара.',
    },
  };
export type Answer = (
  character: Character,
  turns: ConversationTurn[],
  content: string,
  context?: ConversationContext,
  signal?: AbortSignal,
) => Promise<string | GeneratedAnswer>;
interface Options {
  elinaOffice?: (user:string)=>Promise<ElinaOfficeAccess>;
  classifyConflict?: ClassifyConflict;
  conflicts?: Pick<SqlConflictStore, 'state'|'phrase'>;
  privacy?: DialoguePrivacy;
  moderate?: Moderation;
  store?: ConversationStore;
  answer?: Answer;
  apiKey?: string;
  openAIProxyUrl?: string;
  closeRouterKey?: string;
  closeRouterModel?: string;
  closeRouterProvider?: string;
  model?: string;
  gameStore?: CardHistoryStore;
  memory?: Pick<SqlConversationMemory, 'context'>;
}
const messageSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().min(0),
    content: z.string().trim().min(1).max(4000),
    conflictAction: z.enum(['apologize', 'challenge']).optional(),
  })
  .strict();
// The entire check, including its database read, shares one bounded deadline.
function conflictDeadline<T>(check:(signal:AbortSignal)=>Promise<T>,parent:AbortSignal):Promise<T>{
 const controller=new AbortController();
 const signal=AbortSignal.any([parent,controller.signal]);
 let expired=()=>{};
 const timer=setTimeout(()=>controller.abort(),6000);
 const result=new Promise<T>((resolve,reject)=>{
  expired=()=>reject(new Error('bar_conflict_check_timeout'));
  if(signal.aborted){expired();return;}
  signal.addEventListener('abort',expired,{once:true});
  check(signal).then(resolve,reject);
 });
 return result.finally(()=>{clearTimeout(timer);signal.removeEventListener('abort',expired);});
}
export const conversationRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  const store = options.store ?? new SqlConversationStore(app.pg);
  const games = options.gameStore ?? new SqlCardHistoryStore(app.pg);
  app.post('/bar/card-history', { preHandler: [app.authenticate] }, async request => {
    const parsed = cardResultSchema.safeParse(request.body);
    if (!parsed.success) throw new AppError('bad_request', 'Некорректная запись партии.', 400);
    if (Date.parse(parsed.data.endedAt) > Date.now() + 300000)
      throw new AppError('bad_request', 'Некорректное время партии.', 400);
    if (!await games.save(request.user.id, parsed.data))
      throw new AppError('card_history_conflict', 'Запись партии уже существует.', 409);
    return { saved: true };
  });
  const openAITransport=createServiceProxyFetch('https://api.openai.com',options.openAIProxyUrl);
  app.addHook('onClose',async()=>{await openAITransport.close();});
  const providers = { closeRouterProvider: options.closeRouterProvider ?? 'auto', model: options.model ?? 'gpt-5.6-terra', closeRouterModel: options.closeRouterModel ?? 'openai/gpt-5.6-terra',
    ...(options.apiKey ? { openAIKey: options.apiKey } : {}), ...(options.closeRouterKey ? { closeRouterKey: options.closeRouterKey } : {}) };
  const available = !!(options.apiKey || options.closeRouterKey);
  const answer = options.answer ?? createConfiguredAnswer(providers,openAITransport.fetcher);
  const infer = createConfiguredJSON(providers,openAITransport.fetcher);
  const conflicts=options.conflicts ?? (!options.store ? new SqlConflictStore(app.pg) : undefined);
  const classify=options.classifyConflict ?? createConflictClassifier(infer);
  const requireModeration=available || !!options.moderate;
  const moderate=options.moderate ?? createConfiguredModeration(providers,openAITransport.fetcher);
  const memory = options.memory ?? (!options.store ? new SqlConversationMemory(app.pg,
    available ? createStoryValidator(infer) : undefined,available ? createStoryCreator(infer) : undefined) : undefined);
  if (!options.store && available && memory instanceof SqlConversationMemory) {
    const reflect = createReflect(infer);
    let active: Promise<void> | null = null;
    let stopping = false;
    const tick = () => {
      if (active || stopping) return;
      active = (async () => {
        for (let i=0; i<4 && !stopping; i++) if (!await memory.runOne(reflect)) break;
      })().catch(() => { app.log.warn({ code: 'bar_memory_job_failed' }, 'Bar memory job will retry'); })
        .finally(() => { active = null; });
    };
    const timer = setInterval(tick,5000);
    timer.unref();
    app.addHook('onReady', async () => { tick(); });
    app.addHook('onClose', async () => { stopping = true; clearInterval(timer); await active; });
  }
  const characterOf = (params: unknown) => {
    const parsed = z.object({ character: z.enum(characters) }).safeParse(params);
    if (!parsed.success) throw new AppError('bad_request', 'Здесь нет собеседника.', 400);
    return parsed.data.character;
  };
  const privacy=options.privacy ?? (!options.store ? new SqlDialoguePrivacy(app.pg) : undefined);
  const privacySchema=z.discriminatedUnion('type',[
    z.object({type:z.literal('enabled'),enabled:z.boolean()}).strict(),
    z.object({type:z.literal('clear'),revision:z.number().int().min(0)}).strict(),
    z.object({type:z.literal('delete'),id:z.string().uuid(),version:z.number().int().positive()}).strict(),
    z.object({type:z.literal('edit'),id:z.string().uuid(),version:z.number().int().positive(),content:z.string().trim().min(1).max(300)}).strict(),
  ]);
  app.get('/bar/conversations/:character/memory',{preHandler:[app.authenticate]},async request=>{
    if(!privacy) throw new AppError('conversation_unavailable','Память пока недоступна.',503);
    return privacy.read(request.user.id,characterOf(request.params));
  });
  app.patch('/bar/conversations/:character/memory',{preHandler:[app.authenticate]},async request=>{
    const parsed=privacySchema.safeParse(request.body);
    if(!parsed.success) throw new AppError('bad_request','Некорректная настройка памяти.',400);
    if(!privacy) throw new AppError('conversation_unavailable','Память пока недоступна.',503);
    const character=characterOf(request.params);
    if(!await privacy.change(request.user.id,character,parsed.data)) throw new AppError('memory_conflict','Запись изменилась или не подходит для памяти. Обнови список.',409);
    return privacy.read(request.user.id,character);
  });
  const snapshot = (character: Character, record: ConversationRecord) => ({
    ...record,
    ...(character==='elina'?{interventionActive:false}:{}),
    greeting: characterVoices[character].greeting,
  });
  app.post('/bar/conversations/:character/physical-incident', { preHandler: [app.authenticate] }, async request => {
    const character=characterOf(request.params);
    const parsed=z.object({eventId:z.string().uuid()}).strict().safeParse(request.body);
    if(!parsed.success)throw new AppError('invalid_incident','Не удалось распознать нажатие.',400);
    const {eventId}=parsed.data;
    if(character==='elina')throw new AppError('bad_request','В кабинете доступен разговор.',400);
    await recordPhysicalIncident(app.pg,request.user.id,character,eventId);
    return snapshot(character,await store.read(request.user.id,character));
  });
  app.get('/bar/conversations/:character', { preHandler: [app.authenticate] }, async (request) => {
    const character = characterOf(request.params);
    return snapshot(character, await store.read(request.user.id, character));
  });
  app.post('/bar/conversations/:character', { preHandler: [app.authenticate] }, async (request) => {
    const character = characterOf(request.params);
    const parsed = messageSchema.safeParse(request.body);
    if (!parsed.success)
      throw new AppError('bad_request', 'Напиши сообщение до 4000 символов.', 400);
    const { id, revision } = parsed.data;
    const content=parsed.data.conflictAction === 'apologize' ? 'Извини, больше не буду.' : parsed.data.conflictAction === 'challenge' ? 'Давай выйдем, Олег.' : redactSecrets(parsed.data.content);
    const user = request.user.id;
    if (!parsed.data.conflictAction && !options.answer && !available)
      throw new AppError(
        'conversation_unavailable',
        'Собеседник пока не отвечает. Попробуй позже.',
        503,
      );
    const reserved = await store.reserve(user, character, id, revision, !!parsed.data.conflictAction);
    if (reserved.kind === 'duplicate') {
      if (reserved.record.turns.find((t) => t.id === id)?.user !== content)
        throw new AppError('conversation_stale', 'Обнови разговор.', 409);
      return snapshot(character, await store.read(user, character));
    }
    if (reserved.kind === 'limit')
      throw new AppError('conversation_limit', 'Сегодня много поговорили. Продолжим завтра.', 429);
    if (reserved.kind !== 'reserved')
      throw new AppError(
        reserved.kind === 'busy' ? 'conversation_busy' : 'conversation_stale',
        'Обнови разговор перед отправкой.',
        409,
      );
    try {
      const office=character==='elina'?await (options.elinaOffice??(user=>requireElinaOffice(app.pg,user)))(user):null;
      if(office&&parsed.data.conflictAction)throw new AppError('conversation_stale','В кабинете доступен обычный разговор.',409);
      if (parsed.data.conflictAction) {
        if (!conflicts) throw new AppError('conversation_stale', 'Обнови разговор.', 409);
        const current = await conflicts.state(user);
        if (!current.intervening) throw new AppError('conversation_stale', 'Олег уже не вмешивается. Обнови разговор.', 409);
        const verdict = parsed.data.conflictAction === 'apologize' ? 'apology' : 'insult';
        const effect: ConflictEffect = {...nextConflict(current, verdict), day: current.day, category: verdict};
        const reply = await conflicts.phrase(effect.kind, verdict);
        return snapshot(character, await store.complete(user, character, {
          id, user: content, assistant: reply, createdAt: new Date().toISOString(),
          speaker: 'oleg', intervention: effect.kind, emotion:effect.kind==='fight'?'displeasure':'neutral',
        }, [], effect));
      }
      let context: ConversationContext | undefined;
      try { context = await memory?.context(user,character,content,reserved.record.turns); }
      catch { app.log.warn({ code: 'bar_memory_context_failed' }, 'Conversation continues without memory'); }
      if (request.barNovice) context = {summary:'', facts:[], relationship:[], tool:async()=>({unavailable:true}), ...context, novice:true};
      if(office&&!options.elinaOffice){
        const meeting=await readElinaMeeting(app.pg,user);
        context={summary:'',facts:[],relationship:[],tool:async()=>({unavailable:true}),...context,elinaMeeting:meeting.context};
      }
      const signal=AbortSignal.timeout(105000);
      const assessmentPromise=conflicts&&!immediateDanger(content)?conflictDeadline(checkSignal=>conflicts.state(user).then(async current=>({current,verdict:await classify(character,reserved.record.turns,content,character==='elina'?false:current.intervening,checkSignal)})),signal).catch(()=>{app.log.warn({code:'bar_conflict_check_failed'},'Conversation continues without conflict escalation');return null;}):Promise.resolve(null);
      const [incoming,assessment]=await Promise.all([immediateDanger(content)?Promise.resolve('crisis' as const):moderate(content,signal),assessmentPromise]);
      if(incoming==='unavailable' && requireModeration) throw new Error('moderation_unavailable');
      let conflict:ConflictEffect|undefined;
      const officeIntervention=office&&incoming==='allow'&&assessment&&['insult','sexual'].includes(assessment.verdict)?elinaIntervention(office.warnings):null;
      if(incoming==='allow'&&assessment&&!office) {
        const {current,verdict}=assessment;
        conflict={...nextConflict(current,verdict),day:current.day,category:verdict};
        if(conflict.kind==='warning')context={...(context??{summary:'',facts:[],relationship:[],tool:async()=>({unavailable:true})}),boundaryWarning:verdict==='sexual'?'sexual':'insult'};
      }
      const scripted=conflict&&['intervention','apology','calm','fight'].includes(conflict.kind);
      let response: string | GeneratedAnswer;
      if(incoming==='crisis') response=crisisReply;
      else if(incoming==='block') response=boundaryReply;
      else if(officeIntervention) response=officeIntervention.text;
      else if(scripted&&conflicts&&conflict) response=await conflicts.phrase(conflict.kind,conflict.category);
      else {
        const history=memory && !context ? [] : reserved.record.turns.slice(context?.historyStart ?? 0);
        const generation=answer(character,history,content,context,signal);
        response=await new Promise<string|GeneratedAnswer>((resolve,reject)=>{
          const expired=()=>reject(new Error('conversation_timeout'));
          signal.addEventListener('abort',expired,{once:true});
          generation.then(resolve,reject).finally(()=>signal.removeEventListener('abort',expired)).catch(()=>{});
        });
        const text=checkedReply(typeof response==='string' ? response : response.text,`${personaOf(character).soul}\n${personaOf(character).common}`);
        const outgoing=await moderate(text,signal);
        if(outgoing==='unavailable' && requireModeration) throw new Error('moderation_unavailable');
        if(outgoing==='crisis' || outgoing==='block') response=outgoing==='crisis' ? crisisReply : boundaryReply;
        else response=typeof response==='string' ? text : {...response,text};
      }
      return snapshot(
        character,
        await store.complete(user, character, {
          id,
          user: content,
          assistant: typeof response === 'string' ? response : response.text,
          createdAt: new Date().toISOString(),
          ...(office?{officeDay:office.day}:{}),
          ...(officeIntervention?{speaker:'oleg' as const,intervention:officeIntervention.intervention}:{}),
          emotion: officeIntervention?'displeasure':response===crisisReply ? 'empathy' : response===boundaryReply || conflict && ['warning','intervention','fight'].includes(conflict.kind) ? 'displeasure' : scripted ? 'neutral' : safeEmotion(typeof response==='string'?undefined:response.emotion),
          ...(scripted&&conflict ? {speaker:'oleg' as const,intervention:conflict.kind} : {}),
        }, typeof response === 'string' ? [] : response.usedStoryIds, conflict, office&&!officeIntervention&&typeof response!=='string'?response.interest:undefined),
      );
    } catch (error) {
      await store.release(user, character, id);
      if(error instanceof AppError)throw error;
      throw new AppError(
        'conversation_unavailable',
        'Собеседник пока не отвечает. Попробуй ещё раз.',
        503,
      );
    }
  });
};
