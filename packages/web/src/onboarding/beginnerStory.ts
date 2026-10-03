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
      copy: 'Стемнело. Коробка давно опустела.\nТы не спеша подкатываешься к месту, где лежит шайба.\nЕщё один бросок – и пора домой.',
      action: 'Подобрать шайбу',
      image: '/onboarding/story/scene-01-court.webp',
      alt: '',
    },
    car: {
      copy: 'Вдруг у площадки остановился старый Logan. У него были необычные для такого авто цифры на номере – 001. На льду стало светлее от яркого света фар.',
      action: 'Интересно, кто это?',
      image: '/onboarding/story/scene-02-car-off.webp',
      alt: '',
    },
    stranger: {
      copy: 'Двигатель глохнет.\nИз машины выходит мужчина. Несколько секунд молча смотрит на площадку.\nПотом кивает на ворота:\n– Бросай.',
      action: 'Что?',
      image: '/onboarding/story/scene-03-stranger.webp',
      alt: '',
    },
    mentor: {
      copy: 'Ты не понимаешь, что он хочет.\n– Раз уж остался, бросай, – говорит незнакомец и небрежно смахивает снег с борта.\n– Только дождись нужного момента.',
      action: 'Перейти к броску',
      image: '/onboarding/story/scene-04-mentor.webp',
      alt: '',
    },
    goal: {
      copy: 'Шайба влетает в ворота.\nМужчина едва заметно кивает.\n\n– Неплохо. Но один бросок не имеет значения. Ведь важно совсем другое.',
      action: 'Узнать, что важно',
      image: '/onboarding/story/scene-06-goal.webp',
      alt: 'Шайба в воротах',
    },
    miss: {
      copy: 'Шайба проходит рядом с воротами.\nНезнакомец даже не меняется в лице.\n\n– Бывает. Один бросок всё равно не имеет значения. Важно другое.',
      action: 'Узнать, что важно',
      image: '/onboarding/story/scene-06-miss.webp',
      alt: 'Шайба рядом с воротами',
    },
    name: {
      copy: 'Мужчина разворачивается и идёт к машине. Затем останавливается и смотрит через плечо.\n– Важно только то, вернёшься ли ты завтра.',
      action: 'И это всё?',
      image: '/onboarding/story/scene-07-name.webp',
      alt: 'Незнакомец у машины',
    },
    threshold: {
      copy: `– Пока да.\nЗатем незнакомец возвращается к борту, откуда-то достаёт маркер и крупно пишет:\n\n${unlockGoalsRequired}\n\n– Забьёшь ${unlockGoalsRequired} шайб, тогда и поговорим.`,
      action: 'А потом?',
      image: '/onboarding/story/scene-08-threshold.webp',
      alt: 'Незнакомец пишет число на борту',
    },
    arena: {
      copy: 'Незнакомец подходит и кивает тебе за спину.\n– А потом сможешь выйти со двора.\nВместе вы смотрите куда-то далеко за площадку и представляете большую хоккейную арену...',
      action: 'Хм, интересно',
      image: '/onboarding/story/scene-09-arena.webp',
      alt: 'Большая арена вдали над городом',
    },
    finale: {
      copy: `Logan уезжает.\nНа площадке снова стало темно и тихо.\nНа борту остались только цифры:\n\n0 / ${unlockGoalsRequired}\n\nУ тебя в голове до сих пор звучат слова:\n– «Увидимся, когда сделаешь».`,
      action: 'Начать путь',
      image: '/onboarding/story/scene-10-finale.webp',
      alt: 'Пустая площадка и уезжающий Logan',
    },
  };
}
