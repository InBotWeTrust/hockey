import { barCharacters, type ConversationCharacter } from './conversationApi.js';
// This standalone preview has no authenticated server or OpenAI credentials.
// Greetings are fixed copy. No fabricated AI replies are returned.
const greetings: Record<ConversationCharacter, string> = {
  elina:'Добрый день. Слушаю тебя.',
  maria: 'Привет! Присаживайся. Сыграем в карты или сначала поболтаем?',
  daria: 'Привет! Как прошла игра? Рассказывай, я слушаю.',
  grigory: 'О, знакомые лица! Садись. Что нового на льду?',
  arsenich: 'Заходи, присаживайся. Как дела? Есть что обсудить?',
  veronika: 'Добро пожаловать в «4-й период»! Как тебе наш бар?',
  oleg: 'Привет. Всё спокойно? Присаживайся, рассказывай.',
  igor: 'Привет! Что смотрел в последнее время? Давай обсудим матч.',
  timofey: 'Привет! Присаживайся. Как дела на льду?',
};
export function installConversationPreview() {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      location.origin,
    );
    if (!url.pathname.includes('/bar/conversations/')) return original(input, init);
    const character = url.pathname.split('/').at(-1) as ConversationCharacter;
    if (character!=='elina'&&!barCharacters.includes(character))
      return Response.json({ error: { code: 'bad_request' } }, { status: 400 });
    if (init?.method === 'POST')
      return Response.json(
        {
          error: {
            code: 'conversation_preview',
            message: 'OpenAI is not connected to this standalone preview.',
          },
        },
        { status: 503 },
      );
    return Response.json({
      greeting: greetings[character],
      revision: 0,
      pending: false,
      turns: [],
      preview: true,
    });
  };
}
