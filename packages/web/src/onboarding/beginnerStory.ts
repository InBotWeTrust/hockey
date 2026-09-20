export type BeginnerStoryNarrativeScene =
  | 'court'
  | 'car'
  | 'stranger'
  | 'mentor'
  | 'goal'
  | 'miss'
  | 'name'
  | 'threshold'
  | 'arena'
  | 'finale';

export type BeginnerStoryScene = BeginnerStoryNarrativeScene | 'shot';

export interface BeginnerStorySceneContent {
  copy: string;
  action: string;
  image: string;
  alt: string;
}

export function beginnerStoryScenes(
  unlockGoalsRequired: number,
): Record<BeginnerStoryNarrativeScene, BeginnerStorySceneContent> {
  return {
    court: {
      copy: 'Коробка давно опустела.\nТы подбираешь последнюю шайбу.\nЕщё один бросок – и домой.',
      action: 'Сделать бросок',
      image: '/onboarding/story/scene-01-court.png',
      alt: '',
    },
    car: {
      copy: 'За бортом вспыхивает свет фар.\nУ площадки остановился старый Logan.\nНа номере – 001.',
      action: 'Кто там?',
      image: '/onboarding/story/scene-02-car-off.png',
      alt: '',
    },
    stranger: {
      copy: 'Двигатель глохнет.\nИз машины выходит мужчина. Несколько секунд молча смотрит на площадку.\nПотом кивает на ворота:\n– Бросай.',
      action: 'Что?',
      image: '/onboarding/story/scene-03-stranger.png',
      alt: '',
    },
    mentor: {
      copy: '– Раз уж остался на последний, то не тяни, делай бросок.\nНезнакомец немного смахивает снег с борта.\n– Только не торопись, дождись момента.',
      action: 'Я готов',
      image: '/onboarding/story/scene-04-mentor.png',
      alt: '',
    },
    goal: {
      copy: 'Шайба влетает в ворота.\nНезнакомец едва заметно кивает.\n\n– Неплохо. Только один бросок ничего не значит.',
      action: 'А что значит?',
      image: '/onboarding/story/scene-06-goal.png',
      alt: 'Шайба в воротах',
    },
    miss: {
      copy: 'Шайба проходит рядом с воротами.\nНезнакомец даже не меняется в лице.\n\n– Бывает. Один бросок всё равно ничего не значит.',
      action: 'А что значит?',
      image: '/onboarding/story/scene-06-miss.png',
      alt: 'Шайба рядом с воротами',
    },
    name: {
      copy: '– Значит то, вернёшься ли ты после него.\nМужчина разворачивается и идёт к машине.\n– А как вас зовут?\nОн оборачивается и едва заметно улыбается.\n– Арсенич.',
      action: 'И всё?',
      image: '/onboarding/story/scene-07-name.png',
      alt: 'Арсенич у машины',
    },
    threshold: {
      copy: `Арсенич усмехается.\n– Пока да.\nОн подходит к борту, достаёт маркер и крупно пишет:\n\n${unlockGoalsRequired}\n\n– Забьёшь ${unlockGoalsRequired} – тогда и поговорим.`,
      action: 'Триста шайб?',
      image: '/onboarding/story/scene-08-threshold.png',
      alt: 'Арсенич пишет число на борту',
    },
    arena: {
      copy: 'Ты смотришь на число на борту.\n– А потом?\nАрсенич уже открывает дверь машины. Но затем подходит к борту и кивает куда-то за твою спину.\nИ они оба представили себе большую арену где-то над городом.\n– Потом выйдешь со двора.',
      action: 'Хм, интересно...',
      image: '/onboarding/story/scene-09-arena.png',
      alt: 'Большая арена вдали над городом',
    },
    finale: {
      copy: `Logan уезжает.\nНа площадке снова тихо.\nНа борту осталось только:\n\n0 / ${unlockGoalsRequired}\n\n«Увидимся, когда закончишь».`,
      action: 'Начать путь',
      image: '/onboarding/story/scene-10-finale.png',
      alt: 'Пустая площадка и уезжающий Logan',
    },
  };
}
