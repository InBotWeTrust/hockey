import { personaOf } from './personas.js';
import { SqlDialoguePrivacy, type DialoguePrivacy } from './dialoguePrivacy.js';
import { redactSecrets, immediateDanger, crisisReply, boundaryReply, checkedReply, createModeration, type Moderation } from './dialogueSafety.js';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { SqlConversationStore } from './conversationStore.js';
import { createConfiguredAnswer, createConfiguredJSON } from './openAIAnswer.js';
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
] as const;
export type Character = (typeof characters)[number];
export interface ConversationTurn {
  id: string;
  user: string;
  assistant: string;
  createdAt: string;
}
export interface ConversationRecord {
  revision: number;
  turns: ConversationTurn[];
  pending: boolean;
}
export type Reservation =
  | { kind: 'reserved' | 'duplicate'; record: ConversationRecord }
  | { kind: 'busy' | 'stale' | 'limit' };
export interface ConversationStore {
  read(user: string, character: Character): Promise<ConversationRecord>;
  reserve(user: string, character: Character, id: string, revision: number): Promise<Reservation>;
  complete(user: string, character: Character, turn: ConversationTurn): Promise<ConversationRecord>;
  release(user: string, character: Character, id: string): Promise<void>;
}
export const characterVoices: Record<Character, { name: string; greeting: string; voice: string }> =
  {
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
        'Шустрый, хитрый, ехидный любитель карт. Подкалывает по-доброму. Не выдаёт себя за честнейшего игрока.',
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
      voice: 'Охранник стадиона. Немногословный, спокойный, внимательный, с добрым сухим юмором.',
    },
    timofey: {
      name: 'Тимофей',
      greeting: 'Привет! Наконец можно передохнуть. Как твои дела?',
      voice: 'Работник стадиона. Практичный, дружелюбный, любит хоккей и обычные разговоры.',
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
  privacy?: DialoguePrivacy;
  moderate?: Moderation;
  store?: ConversationStore;
  answer?: Answer;
  apiKey?: string;
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
  })
  .strict();
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
  const providers = { closeRouterProvider: options.closeRouterProvider ?? 'provider-7', model: options.model ?? 'gpt-5.6-terra', closeRouterModel: options.closeRouterModel ?? 'openai/gpt-5.6-terra',
    ...(options.apiKey ? { openAIKey: options.apiKey } : {}), ...(options.closeRouterKey ? { closeRouterKey: options.closeRouterKey } : {}) };
  const available = !!(options.apiKey || options.closeRouterKey);
  const answer = options.answer ?? createConfiguredAnswer(providers);
  const infer = createConfiguredJSON(providers);
  const requireModeration=available || !!options.moderate;
  const moderate=options.moderate ?? createModeration(options.apiKey);
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
    greeting: characterVoices[character].greeting,
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
    const content=redactSecrets(parsed.data.content);
    const user = request.user.id;
    if (!options.answer && !available)
      throw new AppError(
        'conversation_unavailable',
        'Собеседник пока не отвечает. Попробуй позже.',
        503,
      );
    const reserved = await store.reserve(user, character, id, revision);
    if (reserved.kind === 'duplicate') {
      if (reserved.record.turns.find((t) => t.id === id)?.user !== content)
        throw new AppError('conversation_stale', 'Обнови разговор.', 409);
      return snapshot(character, reserved.record);
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
      let context: ConversationContext | undefined;
      try { context = await memory?.context(user,character,content,reserved.record.turns); }
      catch { app.log.warn({ code: 'bar_memory_context_failed' }, 'Conversation continues without memory'); }
      const signal=AbortSignal.timeout(25000);
      const incoming=immediateDanger(content) ? 'crisis' : await moderate(content,signal);
      if(incoming==='unavailable' && requireModeration) throw new Error('moderation_unavailable');
      let response: string | GeneratedAnswer;
      if(incoming==='crisis') response=crisisReply;
      else if(incoming==='block') response=boundaryReply;
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
        }, typeof response === 'string' ? [] : response.usedStoryIds),
      );
    } catch {
      await store.release(user, character, id);
      throw new AppError(
        'conversation_unavailable',
        'Собеседник пока не отвечает. Попробуй ещё раз.',
        503,
      );
    }
  });
};
