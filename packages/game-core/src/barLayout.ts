export const barOccupants = [
  'daria',
  'grigory',
  'maria',
  'arsenich',
  'online',
  'oleg',
  'timofey',
  'veronika',
  'igor',
  'news',
  'broadcasts',
] as const;
export type BarCharacterId =
  | 'daria'
  | 'grigory'
  | 'maria'
  | 'arsenich'
  | 'oleg'
  | 'timofey'
  | 'veronika'
  | 'igor';
export type BarOccupantId = (typeof barOccupants)[number];
export type BarAction = 'cards' | 'online' | 'broadcasts';
export interface BarSlot {
  id: string;
  occupantId: BarOccupantId | null;
  x: number;
  y: number;
  scale: number;
}
export interface BarProfile {
  name: string;
  role: string;
  description: string;
  avatar: string | null;
  composition: string | null;
}
export interface BarLayout {
  slots: BarSlot[];
  defaultSlotId: string;
  profiles: Record<BarOccupantId, BarProfile>;
}
export interface BarLayoutSnapshot {
  revision: number;
  layout: BarLayout;
}
export const barActionsFor = (id: BarOccupantId | null): BarAction[] =>
  id && ['daria', 'grigory', 'maria', 'arsenich'].includes(id)
    ? ['cards']
    : id === 'online'
      ? ['online']
      : id === 'broadcasts'
        ? ['broadcasts']
        : [];
export function createDefaultBarLayout(): BarLayout {
  const profile = (
    name: string,
    role: string,
    description: string,
    avatar: string | null = null,
    composition: string | null = null,
  ): BarProfile => ({ name, role, description, avatar, composition });
  return {
    defaultSlotId: 'bar-8',
    slots: barOccupants.filter((id) => id !== 'news').map((occupantId, i) => ({
      id: `bar-${i + 1}`,
      occupantId,
      x: 50,
      y: 50,
      scale: 1,
    })),
    profiles: {
      daria: profile(
        'Дарья',
        'Официантка',
        'Открытая и любопытная. Легко знакомится с людьми и не боится задавать вопросы.',
        '/bar/cards/daria-avatar-v2.webp',
        '/bar/cards/daria-composition-v1.webp',
      ),
      grigory: profile(
        'Григорий',
        'Заливщик льда',
        'Шустрый и хитрый, за словом в карман не лезет. Любит поддеть собеседника и проверить его на прочность.',
        '/bar/cards/grigory-avatar-v2.webp',
        '/bar/cards/grigory-composition-v1.webp',
      ),
      maria: profile(
        'Мария',
        'Официантка',
        'Общительная и наблюдательная. Любит подшутить, но всегда знает, когда стоит выслушать.',
        '/bar/cards/avatar-v2.webp',
        '/bar/cards/maria-composition-v1.webp',
      ),
      arsenich: profile(
        'Арсенич',
        'Работник стадиона',
        'Спокойный и рассудительный. Говорит прямо, замечает больше, чем показывает, и помогает без лишних слов.',
        '/bar/cards/arsenich-avatar-v2.webp',
        '/bar/cards/arsenich-composition-v1.webp',
      ),
      online: profile(
        'Играть онлайн',
        '',
        'Найди соперников или пригласи знакомого игрока.',
        null,
        '/bar/cards/online-terminal-v1.webp',
      ),
      oleg: profile('Олег', 'Охранник', 'Немногословный и внимательный. Следит за порядком, ценит прямоту и иногда неожиданно шутит.', '/bar/cards/oleg-avatar-v2.webp', '/bar/cards/oleg-composition-v1.webp'),
      timofey: profile('Тимофей', 'Руководитель службы стадиона', 'Уверенный и обаятельный руководитель службы стадиона. Начальник Григория; любит пошутить, иногда забывает мелочи и легко находит общий язык с людьми.', '/bar/cards/timofey-avatar-v2.webp', '/bar/cards/timofey-composition-v2.webp'),
      veronika: profile('Вероника', 'Управляющая баром', 'Собранная и гостеприимная. Держит бар в порядке, замечает каждую мелочь и умеет найти подход к людям.', '/bar/cards/veronika-avatar-v1.webp', '/bar/cards/veronika-composition-v1.webp'),
      igor: profile('Игорь', 'Бармен', 'Общительный парень, который всегда в курсе спортивных новостей. Любит обсуждать матчи, результаты и спорить о любимых командах.', '/bar/cards/igor-avatar-v2.webp', '/bar/cards/igor-composition-v1.webp'),
      news: profile('Газеты на стойке', '', ''),
      broadcasts: profile('Трансляции', '', 'Смотри хоккейные матчи.', null, '/bar/cards/broadcast-tv-v1.webp'),
    },
  };
}
export function moveBarOccupant(
  layout: BarLayout,
  slotId: string,
  occupantId: BarOccupantId | null,
): BarLayout {
  return {
    ...layout,
    slots: layout.slots.map((slot) =>
      slot.id === slotId
        ? { ...slot, occupantId }
        : occupantId && slot.occupantId === occupantId
          ? { ...slot, occupantId: null }
          : { ...slot },
    ),
  };
}
export const isBarAssetPath = (path: string | null): path is string =>
  typeof path === 'string' &&
  /^\/bar\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:webp|png)$/.test(path);
export function barLayoutErrors(layout: BarLayout): string[] {
  const errors: string[] = [];
  if (layout.slots.length !== 10 || new Set(layout.slots.map((s) => s.id)).size !== 10)
    errors.push('Нужно десять страниц с разными идентификаторами.');
  const occupied = layout.slots.flatMap((s) => (s.occupantId ? [s.occupantId] : []));
  if (new Set(occupied).size !== occupied.length)
    errors.push('Персонаж или объект может занимать только одну страницу.');
  if (!layout.slots.some((s) => s.id === layout.defaultSlotId && s.occupantId))
    errors.push('Выбери заполненную страницу для входа в бар.');
  for (const slot of layout.slots) {
    if (
      !slot.id ||
      slot.id.length > 64 ||
      (slot.occupantId !== null && !barOccupants.includes(slot.occupantId))
    )
      errors.push('Неизвестное место в баре.');
    if (
      !Number.isFinite(slot.x) ||
      slot.x < 0 ||
      slot.x > 100 ||
      !Number.isFinite(slot.y) ||
      slot.y < 0 ||
      slot.y > 100 ||
      !Number.isFinite(slot.scale) ||
      slot.scale < 0.5 ||
      slot.scale > 1
    )
      errors.push('Проверь положение и размер изображения.');
  }
  for (const id of barOccupants) {
    const p = layout.profiles[id];
    if (
      !p ||
      !p.name.trim() ||
      p.name.length > 80 ||
      p.role.length > 80 ||
      p.description.length > 240
    ) {
      errors.push('Проверь имя, должность и описание.');
      continue;
    }
    for (const path of [p.avatar, p.composition])
      if (path !== null && !isBarAssetPath(path))
        errors.push('Изображение должно быть локальным файлом в /bar/.');
  }
  return [...new Set(errors)];
}

// Upgrade empty shipped profiles without overriding administrator edits or placement.
export function upgradeBarLayout(layout: BarLayout): BarLayout {
  const next = structuredClone(layout);
  const defaults = createDefaultBarLayout();
  for (const id of ['oleg', 'timofey', 'veronika', 'igor', 'broadcasts'] as const) {
    const current = next.profiles[id];
    next.profiles[id] = current ? {
      ...current,
      avatar: (id === 'igor' || id === 'oleg') && current.avatar === `/bar/cards/${id}-avatar-v1.webp`
        ? defaults.profiles[id].avatar : current.avatar || defaults.profiles[id].avatar,
      composition: current.composition || defaults.profiles[id].composition,
      description: current.description || defaults.profiles[id].description,
    } : defaults.profiles[id];
  }
  const timofey = next.profiles.timofey;
  if (timofey.avatar === '/bar/cards/timofey-avatar-v1.webp') timofey.avatar = defaults.profiles.timofey.avatar;
  if (timofey.composition === '/bar/cards/timofey-composition-v1.webp') timofey.composition = defaults.profiles.timofey.composition;
  if (timofey.role === 'Работник стадиона') timofey.role = defaults.profiles.timofey.role;
  if (timofey.description === "Вечно что-то забывает и ищет повод передохнуть. Курит, флиртует и выпутывается из неловких ситуаций с хитрой улыбкой.") timofey.description = defaults.profiles.timofey.description;
  if (next.profiles.broadcasts.composition === '/bar/broadcasts-entry-v1.webp') next.profiles.broadcasts.composition = defaults.profiles.broadcasts.composition;
  if (!next.slots.some((slot) => slot.occupantId === 'igor')) {
    const newspapers = next.slots.find((slot) => slot.occupantId === 'news');
    if (newspapers) newspapers.occupantId = 'igor';
  }
  return next;
}
