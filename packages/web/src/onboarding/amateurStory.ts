export interface AmateurStoryScene {
  id: string;
  copy: string;
  action: string;
  cue: string;
  imageA: string;
  imageB: string;
}
const frames = (number: string) => ({
  imageA: `/onboarding/amateur/scene-${number}-a.webp`,
  imageB: `/onboarding/amateur/scene-${number}-b.webp`,
});
export const amateurStoryScenes: readonly AmateurStoryScene[] = [
  {
    id: 'greeting',
    ...frames('01'),
    copy: 'Ты снова приходишь на коробку. У борта стоит знакомый Logan. Мужчина замечает тебя.\n\n– Ну что, поздравляю, ты справился. Выбить {unlockGoalsRequired} не каждый может.',
    cue: 'Мужчина замечает тебя.',
    action: 'Вы обещали поговорить',
  },
  {
    id: 'memory',
    ...frames('02'),
    copy: '– А почему вы тогда остановились?\n\nМужчина смотрит на лёд.\n\n– Все уже ушли, а ты остался ещё на один бросок. Я сам раньше так задерживался. Знаешь, когда домой пора, устал, но ещё хочется парочку шайб закинуть.',
    cue: 'смотрит на лёд.',
    action: 'Вы тоже играли?',
  },
  {
    id: 'introduction',
    ...frames('03'),
    copy: '– Нуу... Как-нибудь расскажу. Может быть...\n\nОн смотрит тебе в глаза.\n\n– Арсений Ильич. Можешь звать Арсеничем, тут все меня так зовут.\n\nОн протягивает руку.',
    cue: 'Он протягивает руку.',
    action: 'Пожать руку',
  },
  {
    id: 'professional-arena',
    ...frames('04'),
    copy: 'Ты вспоминаешь большую арену над городом.\n\n– Значит, теперь туда?\n\n– Погоди, туда тебе пока рано. Там настоящие профи. Есть одно место неподалёку, как раз для твоего уровня.',
    cue: '– Значит, теперь туда?',
    action: 'Пойти куда-то поближе',
  },
  {
    id: 'amateur-stadium',
    ...frames('05'),
    copy: 'Вы подходите к небольшому стадиону. За оградой горят прожекторы, на льду идёт матч.\n\nАрсенич показывает на вход.\n\n– Вот сюда. Тут любители играют. Кажется, что ты вполне можешь попробовать сыграть с ними.',
    cue: 'показывает на вход.',
    action: 'Думаете, справлюсь?',
  },
  {
    id: 'invitation',
    ...frames('06'),
    copy: '– Попробуй. На льду и узнаем.\n\nАрсенич поворачивается к входу.\n\n– Пойдём, познакомлю с ребятами. Заодно посмотрю, что ты покажешь там.',
    cue: 'поворачивается к входу.',
    action: 'Пойти с ним',
  },
];

export function getAmateurStoryScenes(unlockGoalsRequired: number): readonly AmateurStoryScene[] {
  return amateurStoryScenes.map((scene) => ({
    ...scene,
    copy: scene.copy.replace('{unlockGoalsRequired}', String(unlockGoalsRequired)),
  }));
}
