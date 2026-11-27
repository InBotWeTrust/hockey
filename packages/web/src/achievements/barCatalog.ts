import type { AchievementDto } from '../api/achievements.js';
import { barAchievementSpecs } from './barCatalogData.js';
import { barAchievementDescription } from './barDescriptions.js';
import { BAR_ARTWORK } from './barArtwork.js';
export type PreviewLevel = 'beginner' | 'amateur';
export interface BarLevel {
  level: number;
  target: number;
  requirement: string;
  stars: number;
  experience: number;
}
export interface BarDefinition {
  id: string;
  number: number;
  title: string;
  description: string;
  game: string;
  gameLabel: string;
  character: string;
  mode: 'character' | 'online' | 'social';
  amateurOnly: boolean;
  photoUrl: string;
  levels: BarLevel[];
}
const games = [
  { first: 1, last: 5, id: 'darts', label: 'Дартс', character: 'Дарья', art: 'daria' },
  { first: 6, last: 12, id: 'billiards', label: 'Бильярд', character: 'Вероника', art: 'veronika' },
  { first: 13, last: 19, id: 'checkers', label: 'Шашки', character: 'Арсенич', art: 'arsenich' },
  { first: 20, last: 25, id: 'ochko', label: 'Очко', character: 'Григорий', art: 'grigory' },
  { first: 26, last: 29, id: 'armwrestling', label: 'Армрестлинг', character: 'Олег', art: 'oleg' },
  {
    first: 30,
    last: 35,
    id: 'battleship',
    label: 'Морской бой',
    character: 'Тимофей',
    art: 'timofey',
  },
  { first: 36, last: 43, id: 'durak', label: 'Дурак', character: 'Мария', art: 'maria' },
];
const amateurCharacters = new Set(['Арсенич', 'Тимофей', 'Мария', 'Элина']);
const acquaintances = [
  'Игорь',
  'Дарья',
  'Вероника',
  'Григорий',
  'Олег',
  'Арсенич',
  'Тимофей',
  'Мария',
  'Элина',
];
const cumulative = new Set([1, 6, 13, 20, 26, 30, 36]);
const streaks = new Set([2, 7, 14, 21, 27, 31, 37]);
const targets: Record<number, number[]> = {
  3: [180, 180],
  4: [9],
  9: [3, 4, 5, 6],
  15: [2, 3, 4],
  17: [1, 2],
  23: [1, 5, 10],
  33: [3, 5, 10],
  38: [5, 3],
  40: [2, 4, 6],
};
const requirements: Record<number, (v: number, i: number) => string> = {
  3: (_, i) =>
    i === 0
      ? 'Набрать 180 очков тремя дротиками за один свой ход.'
      : 'Набрать по 180 очков два своих хода подряд в одной партии.',
  4: () => 'Законно завершить партию с 501 очка за девять дротиков.',
  8: () => 'Победить с разницей ровно в один обычный шар.',
  9: (v) => 'Победить с разницей ровно в ' + v + (v < 5 ? ' обычных шара.' : ' обычных шаров.'),
  10: () => 'Выиграть всухую: у соперника ни одного зачтённого обычного шара.',
  11: () => 'Допустить собственный фол и всё равно выиграть партию.',
  15: (v) => 'Взять ' + v + ' фигуры соперника одним ходом.',
  16: () => 'Довести свою шашку до превращения в дамку.',
  17: (v) =>
    'Выиграть партию, в которой у соперника ' +
    (v === 1
      ? 'была хотя бы одна дамка.'
      : 'были две дамки одновременно. Дамки могут быть затем срублены.'),
  18: () => 'Выиграть, потеряв не больше шести из двенадцати своих шашек.',
  22: () => 'Успешно разоблачить жульничество Григория.',
  23: (v) =>
    'Выиграть у Григория, уступая перед последней раздачей минимум на ' +
    v +
    (v === 1 ? ' очко.' : ' очков.'),
  24: () => 'Победить с итоговым перевесом ровно в одно очко за всю партию.',
  28: () => 'Победить прижатием до окончания времени.',
  32: () => 'Победить, сохранив свою подлодку на плаву. Повреждение допустимо.',
  33: (v) =>
    'Сделать ' +
    v +
    (v === 3 ? ' попадания' : ' попаданий') +
    ' подряд в одной партии. Собственный промах обрывает серию.',
  34: () => 'Попасть первым же собственным выстрелом в партии.',
  38: (v) =>
    'Выиграть, получив за всю партию не больше ' +
    v +
    ' козырей: из раздачи, добора и взятых со стола карт.',
  39: () => 'Закончить победную партию двумя шестёрками.',
  40: (v) =>
    'За одну защиту отбить ' +
    v +
    (v < 5 ? ' атакующие карты' : ' атакующих карт') +
    ' и отправить весь розыгрыш в отбой.',
  41: () => 'Выиграть партию, ни разу не взяв карты со стола.',
  42: () =>
    'Начать атакующий розыгрыш с шестью картами на руках и выложить все шесть за этот розыгрыш.',
  54: () => 'Купить или продлить клубную карту после запуска заданий.',
};
export const barAchievementDefinitions: BarDefinition[] = barAchievementSpecs.flatMap((spec) => {
  const game = games.find((g) => spec.n >= g.first && spec.n <= g.last);
  const character = game?.character ?? acquaintances[spec.n - 45] ?? '';
  const modes: BarDefinition['mode'][] =
    spec.modes === 2 ? ['character', 'online'] : [game ? 'character' : 'social'];
  return modes.map((mode) => {
    const amateurOnly = mode !== 'online' && amateurCharacters.has(character);
    return {
      id: 'bar-' + spec.n + '-' + mode,
      number: spec.n,
      title: spec.name + (game ? ' · ' + (mode === 'online' ? 'Онлайн' : character) : ''),
      description: barAchievementDescription(spec.n, mode),
      game: game?.id ?? 'social',
      gameLabel: game?.label ?? 'Посещения и знакомства',
      character,
      mode,
      amateurOnly,
      photoUrl: BAR_ARTWORK[spec.n]!,
      levels: spec.rewards.map((stars, i) => {
        const target =
          typeof spec.conditions[i] === 'number'
            ? (spec.conditions[i] as number)
            : (targets[spec.n]?.[i] ?? 1);
        let requirement = requirements[spec.n]?.(target, i);
        if (cumulative.has(spec.n))
          requirement =
            'Победить в этой игре ' +
            target +
            ' раз ' +
            (mode === 'online'
              ? 'против реальных игроков.'
              : 'против персонажа «' + character + '».');
        if (streaks.has(spec.n))
          requirement =
            'Выиграть ' +
            target +
            (target < 5 ? ' партии подряд ' : ' партий подряд ') +
            (mode === 'online'
              ? 'против реальных игроков.'
              : 'против персонажа «' + character + '».');
        if (spec.name.startsWith('Реванш'))
          requirement =
            'После поражения выиграть следующую партию в этой игре у того же соперника.';
        if (spec.n === 44)
          requirement =
            'Посетить бар в ' +
            target +
            (target === 1 ? ' день' : ' разных дней') +
            ': завершить игру или отправить сообщение любому персонажу. Пропуски не сбрасывают прогресс.';
        if (spec.n >= 45 && spec.n <= 53)
          requirement =
            'Начать разговор с персонажем «' +
            character +
            '»: отправить сообщение и получить ответ.';
        return {
          level: i + 1,
          target,
          requirement: requirement ?? String(spec.conditions[i]),
          stars,
          experience: stars,
        };
      }),
    };
  });
});
export function buildBarAchievements(level: PreviewLevel): AchievementDto[] {
  return barAchievementDefinitions.map((def, index) => {
    const first = def.levels[0]!;
    const stage = {
      current: 1,
      total: def.levels.length,
      requirement: first.requirement,
      progressValue: 0,
      targetValue:
        cumulative.has(def.number) || streaks.has(def.number) || def.number === 44
          ? first.target
          : 1,
      history: [],
    };
    if (level === 'beginner' && def.amateurOnly)
      return {
        id: 'bar-locked-' + index,
        title: 'Неизвестное задание',
        photoUrl: '/profile/achievements-card-art.png',
        description: 'Доступно со статуса «Любитель»',
        requirement: 'Доступно со статуса «Любитель»',
        category: 'bar',
        availability: 'active',
        futureTag: null,
        rewardCurrency: 0,
        rewardStars: 0,
        rewardExperience: 0,
        status: 'locked',
        isUnlocked: false,
        isClaimable: false,
        accessRequirement: 'amateur',
        stage: { ...stage, requirement: 'Доступно со статуса «Любитель»', targetValue: 0 },
        bar: { mode: def.mode },
      };
    return {
      id: def.id,
      title: def.title,
      photoUrl: def.photoUrl,
      description: def.description,
      requirement: first.requirement,
      category: 'bar',
      availability: 'active',
      futureTag: null,
      rewardCurrency: 0,
      rewardStars: first.stars,
      rewardExperience: first.experience,
      status: 'locked',
      isUnlocked: true,
      isClaimable: false,
      stage,
      levels: def.levels,
      bar: { mode: def.mode, game: def.game, gameLabel: def.gameLabel, character: def.character },
    };
  });
}
