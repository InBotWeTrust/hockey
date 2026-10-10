import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { SqlConversationStore } from './conversationStore.js';
import { createOpenAIAnswer } from './openAIAnswer.js';

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
) => Promise<string>;
interface Options {
  store?: ConversationStore;
  answer?: Answer;
  apiKey?: string;
  model?: string;
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
  const answer =
    options.answer ?? createOpenAIAnswer(options.apiKey, options.model ?? 'gpt-5.6-terra');
  const characterOf = (params: unknown) => {
    const parsed = z.object({ character: z.enum(characters) }).safeParse(params);
    if (!parsed.success) throw new AppError('bad_request', 'Здесь нет собеседника.', 400);
    return parsed.data.character;
  };
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
    const { id, revision, content } = parsed.data;
    const user = request.user.id;
    if (!options.answer && !options.apiKey)
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
      const response = await answer(character, reserved.record.turns, content);
      return snapshot(
        character,
        await store.complete(user, character, {
          id,
          user: content,
          assistant: response,
          createdAt: new Date().toISOString(),
        }),
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
