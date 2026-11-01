export const cityTourPlaces = [
  {
    id: 'yard',
    title: 'Дворовый каток',
    copy: 'Здесь начинается твой путь в Любители. Играй ежедневные периоды и забей {target} шайб, чтобы открыть стадион «Центральный».',
  },
  {
    id: 'locker',
    title: 'Раздевалка',
    copy: 'Здесь можно посмотреть инвентарь и подготовить экипировку перед выходом на лёд.',
  },
  {
    id: 'shop',
    title: 'Магазин',
    copy: 'Загляни сюда, когда захочешь пополнить инвентарь. Для первой игры покупки не нужны.',
  },
  {
    id: 'tasks',
    title: 'Задания',
    copy: 'Следи за достижениями и забирай заработанные награды. За первый завершённый период тебя уже ждёт первое достижение.',
  },
  {
    id: 'chat',
    title: 'Лента',
    copy: 'Здесь можно узнать новости хоккейного города и общаться с другими игроками.',
  },
  {
    id: 'bank',
    title: 'Банк',
    copy: 'Здесь находятся пополнение игровой валюты и история операций. Начать играть можно без пополнения.',
  },
  {
    id: 'stadium',
    title: 'Стадион «Центральный»',
    copy: 'Следующая ступень твоей карьеры. Он откроется после {target} зачётных шайб в дневной игре. У Любителей появятся дуэли и турниры.',
  },
  {
    id: 'gym',
    title: 'Спортзал',
    copy: 'Спортзал ещё готовится к открытию. А потренировать броски и пройти упражнения можно во дворе.',
  },
  {
    id: 'bar',
    title: 'Бар «4-й период»',
    copy: 'Место для перерыва между играми: знакомься с жителями города и играй с другими хоккеистами.',
  },
  {
    id: 'fame',
    title: 'Зал славы',
    copy: 'Будущий зал спортивных результатов и успехов игроков. Сейчас он ещё готовится к открытию.',
  },
  {
    id: 'bonus',
    title: 'Бонусные игры',
    copy: 'Короткие игровые испытания для разнообразия. Прогресс к Любителям набирается отдельно – в ежедневной игре.',
  },
  {
    id: 'pro',
    title: 'Арена Ультимейт',
    copy: 'Будущая ступень для профессионалов. Пока сосредоточься на первых периодах и переходе в Любители.',
  },
  {
    id: 'profile',
    title: 'Моя квартира',
    copy: 'Твой профиль, достижения и настройки. В настройках можно снова открыть знакомство с городом.',
  },
] as const;
export type TourLocation = (typeof cityTourPlaces)[number]['id'];
export type TourAction =
  | { action: 'view'; location: TourLocation }
  | { action: 'dismiss' | 'finish' };
export interface TourState {
  viewed: string[];
  lastLocation: string;
  completed: boolean;
  gameStarted: boolean;
  eligible: boolean;
  target: number;
  autoShow?: boolean;
}
export interface CityTourApi {
  open: () => Promise<TourState>;
  action: (action: TourAction) => Promise<TourState>;
}
export function applyTourAction(state: TourState, action: TourAction): TourState {
  if (action.action === 'view')
    return {
      ...state,
      viewed: [...new Set([...state.viewed, action.location])],
      lastLocation: action.location,
    };
  if (action.action === 'finish')
    return {
      ...state,
      completed: cityTourPlaces.every((p) => state.viewed.includes(p.id)),
      lastLocation: 'yard',
    };
  return state;
}
