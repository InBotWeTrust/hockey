# Ultimate Hockey — PWA MVP (Фаза 1) — Дизайн-документ

**Дата:** 2026-04-12
**Автор:** Егор Гуменюк + Claude
**Репозиторий:** https://github.com/InBotWeTrust/hockey
**Статус:** Дизайн утверждён, готов к имплементационному плану

---

## 1. Контекст и цель

Ultimate Hockey — мобильная хоккейная игра-тапалка в формате PWA, вдохновлённая OVI Universe (механика тайминга между движущимся вратарём и воротами) и Prison (структура мета-игры: боссы, инвентарь, кланы, ежедневные активности).

**Цель Фазы 1 (MVP):** выпустить узкое ядро геймплея с достаточной глубиной, чтобы проверить, залипает ли игрок в сам бросок. Без команд, чата, тренировок и полной прокачки — всё это идёт в последующие фазы.

**Целевая аудитория:** русскоязычные мобильные игроки, приходящие из VK/Telegram. Основной сценарий — телефон в портретной ориентации; десктоп поддерживается в «рамке телефона».

**Не-цели MVP:** PvP в реальном времени, команды/кланы, тренировки, полный инвентарь, прогнозы на реальные матчи, денежные ставки, монетизация рублями, NFT.

---

## 2. Target Vision (итоговое состояние игры)

Зафиксированное видение игры целиком — описывается не для того, чтобы всё строить сразу, а чтобы Фаза 1 проектировалась с учётом будущих фаз (схема БД, архитектура пакетов, форматы данных).

**Геймплей:**
- Ядро — тайминговая задача: поймать момент, когда окно между движущимся вратарём и движущимися воротами открыто под углом твоего броска с учётом силы.
- Три переключаемых механики управления: drag & release, tap + hold, swipe.
- Прицеливание (угол), сила броска, вратари с уникальными характерами и паттернами движения.

**Прогрессия и мета:**
- Лестница вратарей-боссов (как «Актив» в Prison: Кучерявый, Банкир и т.д., только хоккейные — Новичок, Стена, Осьминог, Ледяной Король).
- Прокачка хоккеиста: уровни, XP, характеристики (сила, точность, удача, выносливость).
- Полный инвентарь экипировки: клюшки, коньки, перчатки, шлем, с редкостями (обычная / редкая / эпическая / легендарная) и эффектами на формулу броска.
- Тренировки как карта активностей (по аналогии с «Актив» в Prison: зал, кости, гиря, бег, душ, сейф) — тратят время/энергию, дают XP на разные характеристики.

**Социалка:**
- Команды (кланы) с внутренним чатом.
- Командные турниры: создаётся турнир, приглашается другая команда, играются серии.
- Индивидуальные турниры 1v1 между игроками.
- Клановые рейды на мегавратарей — общий ХП, каждый член команды вносит серии.
- Ставки внутренней валютой на исход турниров.

**Экономика:**
- Мягкая валюта: шайбы (добываются в игре).
- Премиум-валюта: золотые шайбы (покупаются за рубли через ЮKassa, не выводятся обратно).
- Монетизация: покупка попыток, расходники, косметические скины, сезонный пропуск (batte pass).
- Опционально: реклама за дополнительные попытки.

**Чего в Target Vision НЕ будет:**
- NFT — регуляторный риск, не даёт реальной ценности.
- Денежные ставки на исход (ФЗ-244, требует лицензию букмекера).
- Криптовалютные выплаты.

**Связь с MVP:** схема БД, структура `game-core`, форматы данных в API и модели вратарей закладывают поля «на вырост» (например, `Stick.effects` с опциональными `level`, `sockets`, `setId`), чтобы в Фазе 2 мы **добавляли**, а не **переписывали**.

---

## 3. Скоуп Фазы 1 (MVP)

### Что входит

1. **Авторизация:** OAuth через Telegram Login Widget и VK OAuth 2.0. Без гостевого режима.
2. **Игровое ядро:** один экран поединка с движущимся вратарём, движущимися воротами, прицеливанием, силой броска, детерминированным движением.
3. **Три механики управления** (drag / tap+hold / swipe) как переключатель в настройках, с тренировочным режимом для тестирования.
4. **10 вратарей-боссов** с лестницей открытия, 4 паттернами движения (linear, sine, dash, feint), персистентным HP и стриками.
5. **Модель поединка:** «зашёл → бросаешь → можешь выйти в любой момент». Прогресс HP сохраняется. Стрик голов даёт множитель наград.
6. **Экономика попыток:** 25 в день, восстановление 1 попытка/36 мин, аптечка, коробка шайб, колесо удачи, приглашения друзей.
7. **Минимальная экипировка:** 4 клюшки (обычная / редкая / эпическая / легендарная) с тремя эффектами на бросок. Фиксированное получение (стартовая + дропы с первого клира + одна покупается за шайбы).
8. **Рейтинг «Золотая лига»** — глобальный лидерборд по суммарным голам, топ-100 + окно вокруг игрока.
9. **PWA:** манифест, service worker для оффлайн-кэша статики, «добавить на главный экран».
10. **Адаптация под десктоп:** «рамка телефона» 390×844 в центре экрана с тем же игровым канвасом.

### Что НЕ входит (scope fence)

- Команды, кланы, чат, клановые рейды, командный рейтинг
- Пользовательские турниры, индивидуальные турниры 1v1
- Ставки даже внутренней валютой
- Тренировки (карта активностей)
- Прокачка хоккеиста (уровни, XP, характеристики)
- Полный инвентарь (коньки, перчатки, шлем, прокачка, сеты, рандомные дропы)
- Прогнозы на НХЛ/КХЛ
- Донаты, премиум-валюта «золотые шайбы», батл-пасс, сезоны
- Реклама за попытки
- Telegram Mini App / VK Mini Apps оболочки (только обычный PWA + OAuth-логин)
- Push-уведомления
- NFT

---

## 4. Архитектурные решения

### 4.1 Подход: гибридная симуляция

Клиент считает всё мгновенно для отзывчивости, сервер параллельно валидирует через общий детерминированный код.

**Обоснование:**
- Публичный рейтинг + экономика требуют защиты от читерства → чистый авторитетный клиент не годится.
- Аркадная механика тайминга не терпит сетевой задержки → чистый авторитетный сервер ощущается залипающим.
- Одна шеренная модель игровой логики между клиентом и сервером (пакет `game-core`) — пишется один раз, тестируется одинаково на обоих, честность обеспечивается детерминизмом.

Альтернативы (отброшены):
- **Толстый клиент, тонкий сервер:** быстрее разработка, но читерство обнулит рейтинг.
- **Чистый авторитетный сервер:** честно, но +месяц работы и плохая отзывчивость в аркаде.

### 4.2 Стек

**Языки:** TypeScript end-to-end.

**Монорепо:** pnpm workspaces, три пакета:
```
ultimate-hockey/
├── packages/
│   ├── game-core/     # shared TS-логика игры
│   ├── web/           # React PWA (клиент)
│   └── server/        # Node.js бэкенд
├── pnpm-workspace.yaml
└── package.json
```

**Клиент (`web`):**
- React 18 + Vite + TypeScript
- PixiJS (WebGL) для игрового экрана
- Обычный React + CSS-модули (или Tailwind) для UI профиля/меню/рейтинга
- Zustand — глобальное состояние
- TanStack Query — серверные данные
- vite-plugin-pwa — манифест и service worker

**Сервер (`server`):**
- Node.js 20 + Fastify + TypeScript
- Drizzle ORM + PostgreSQL 16
- Redis 7 (sessions, rate limit, leaderboard sorted set, wallet cache)
- `jose` для JWT, `pino` для логов
- JSON Schema валидация (встроена в Fastify) + `json-schema-to-ts` для TS-типов

**`game-core`:**
- Чистый TypeScript, без зависимостей от браузера или Node
- `seedrandom` — детерминированный PRNG
- Vitest + fast-check для тестов

**Хостинг (MVP):**
- Один VPS (Timeweb / Selectel / Beget), ~500₽/мес
- Docker Compose: caddy (TLS + reverse proxy) + server + postgres + redis + nginx (статика web)
- Бэкапы Postgres — ежедневно на отдельный volume, еженедельно в S3-совместимое хранилище

**CI/CD:**
- GitHub Actions: lint + typecheck + тесты всех пакетов + build
- Деплой на main через SSH: `docker compose pull && up -d`, миграции Drizzle перед рестартом

### 4.3 `game-core` — детерминированный движок

**Структура:**
```
packages/game-core/src/
├── rng.ts            # createRng(seed) на seedrandom
├── rink.ts           # геометрия катка, координаты, размеры
├── goalie/
│   ├── types.ts      # GoalieConfig, GoaliePattern
│   ├── patterns.ts   # linear, sine, dash, feint
│   └── simulate.ts   # simulateGoalie(seed, shotIndex, t) → position
├── shot/
│   ├── types.ts      # ShotInput, ShotResult
│   ├── trajectory.ts # расчёт траектории шайбы
│   └── resolve.ts    # resolveShot(input, goalieState, stickEffects) → result
├── balance/
│   ├── goalies.ts    # каталог 10 вратарей-боссов
│   ├── sticks.ts     # каталог 4 клюшек и их эффекты
│   └── rewards.ts    # формулы наград
└── version.ts        # GAME_CORE_VERSION
```

**Жёсткие правила детерминизма:**
1. Никакого `Math.random()` — только `createRng(seed)`.
2. Никакого `Date.now()` — время передаётся явным параметром.
3. Никаких таймеров (`setTimeout`, `requestAnimationFrame`) внутри `game-core`.
4. Все функции — чистые: `(state, input) → newState`.
5. Никаких `Array.sort()` с нестабильным порядком одинаковых элементов.

**Модель броска:**
```ts
type ShotInput = {
  angle: number;        // радианы, -π/2..π/2, 0 = прямо вверх
  power: number;        // 0..1
  releaseTime: number;  // мс от начала сессии поединка
};

type ShotResult =
  | { type: 'goal'; hitPoint: Vec2 }
  | { type: 'save'; goalieContact: Vec2 }
  | { type: 'miss'; reason: 'wide' | 'short' | 'over' };
```

**Разрешение броска (`resolveShot`)** — чистая функция:
1. По `releaseTime` + `seed` + `shotIndex` вычисляем позицию вратаря и ворот.
2. По `angle` + `power` + модификаторам клюшки строим траекторию шайбы.
3. Проверяем пересечение траектории с вратарём (AABB) → save, с рамой ворот → miss, с сеткой → goal.

**Модификаторы клюшки** применяются здесь (не в отдельном слое), чтобы одна функция описывала весь исход.

### 4.4 Сессия поединка и анти-чит

Модель «поединок с персистентным HP», а не «серия из фиксированного числа бросков».

**Жизненный цикл:**

1. Игрок жмёт «Играть» против вратаря X → `POST /duel/start { goalieId }`.
2. Сервер создаёт `DuelSession` в Postgres + Redis:
    ```ts
    {
      id, userId, goalieId,
      seed,                   // криптостойкий, уникальный на поединок
      shotIndex: 0,
      gameCoreVersion,
      status: 'active',
      startedAt, lastShotAt
    }
    ```
   Возвращает клиенту `{ sessionId, seed, goalieConfig, progress }`.
3. Клиент рендерит вратаря через `simulateGoalie(seed, shotIndex, t)` в PixiJS-цикле. Вратарь едет детерминированно, клиент ничего не угадывает.
4. Игрок делает бросок. Клиент локально вызывает `resolveShot(...)`, сразу рисует результат, параллельно шлёт `POST /duel/shot { sessionId, shotIndex, input }`.
5. Сервер валидирует (в одной транзакции):
    - Сессия существует, активна, `shotIndex` совпадает.
    - Списывает 1 попытку из кошелька (или 409, если нет).
    - Вызывает `runShot(version, seed, shotIndex, stick, input)` из `game-core` → серверный `ShotResult`.
    - Обновляет `goalie_progress` (HP, стрики, множитель).
    - `shotIndex++`, `lastShotAt = now`.
    - Возвращает `{ result, progress, rewards, duelClosed? }`.
6. Если клиентский и серверный результат разошлись → 409 Conflict с серверным результатом. Клиент откатывает визуал. Одно расхождение не считается читом (может быть баг, плавающая точка, версия) — логируется, при N+ расхождений от одного игрока за сутки → флаг «подозрение».
7. HP дошло до 0 → сервер закрывает сессию, начисляет награду + `firstClearBonus` при первом прохождении (включая возможный дроп клюшки), открывает следующего вратаря.
8. Игрок жмёт «Выйти» → `POST /duel/exit`. Сервер закрывает сессию. Прогресс уже сохранён.

**Rate limiting:**
- `/duel/shot`: не чаще 1 запроса в 500 мс на игрока.
- Максимум 30 активных сессий одновременно на один IP.

**Защита от гонок:**
- Совпадение `shotIndex` — защита от дублированных/переупорядоченных запросов.
- Транзакция Postgres на списание попытки + обновление прогресса — защита от параллельных бросков из одной сессии.

**Версионирование:**
- `GAME_CORE_VERSION` фиксируется в момент старта сессии.
- Если в проде появится новая версия (с изменённым балансом или движением) — старые сессии продолжают валидироваться по старой версии до закрытия, либо получают `410 Gone` с требованием пересоздать поединок.

---

## 5. Клиентский рендер и управление

### 5.1 Структура `web`

```
packages/web/src/
├── app/              # роутинг, layout, bottom nav (Профиль/Игра/Меню/Рейтинг)
├── screens/
│   ├── ProfileScreen.tsx
│   ├── DuelScreen.tsx
│   ├── GoalieListScreen.tsx
│   ├── MenuScreen.tsx
│   └── LeaderboardScreen.tsx
├── game/
│   ├── PixiStage.tsx
│   ├── renderer/
│   │   ├── Rink.ts
│   │   ├── Goalie.ts
│   │   ├── Goal.ts
│   │   └── Puck.ts
│   ├── loop.ts
│   └── input/
│       ├── DragInput.ts
│       ├── TapHoldInput.ts
│       ├── SwipeInput.ts
│       └── InputAdapter.ts
├── api/              # TanStack Query клиенты
├── auth/             # Telegram + VK OAuth flow
├── stores/           # Zustand (user, duel, settings)
└── ui/
```

### 5.2 Игровой цикл DuelScreen

1. Mount → `api.duel.start(goalieId)` → `{ sessionId, seed, goalieConfig, progress }`.
2. Инициализация PixiJS Application, сайзинг под «рамку телефона».
3. `requestAnimationFrame` loop: каждый кадр вызывает `simulateGoalie(seed, shotIndex, now)` и обновляет спрайт вратаря и ворот.
4. Активный `InputAdapter` слушает жесты на канвасе → формирует `ShotInput`.
5. Клиент вызывает `resolveShot(...)` локально, анимирует полёт шайбы, параллельно шлёт на сервер.
6. Ответ сервера: совпало — продолжаем, 409 — откат.

### 5.3 Три механики управления

Общий интерфейс:
```ts
interface InputAdapter {
  attach(canvas: HTMLCanvasElement, onShot: (input: ShotInput) => void): void;
  detach(): void;
  drawOverlay(ctx: RenderContext): void;
}
```

- **DragInput** (рекомендованный по умолчанию): `pointerdown` на шайбе → `pointermove` рисует линию оттяжки и дугу предсказания → `pointerup` → `ShotInput { angle, power: clamp(length/maxLength) }`.
- **TapHoldInput**: первый тап в зоне ворот → ставит крестик прицела (= angle) → тап+удержание на шайбе → бегущая шкала силы → отпускание фиксирует `power`.
- **SwipeInput**: `pointerdown` на шайбе, `pointermove` трекает последние 100 мс → `pointerup` → `angle` = направление последнего вектора, `power` = clamp(скорость свайпа).

**Переключение:** `localStorage.controlScheme = 'drag' | 'taphold' | 'swipe'`. Меняется в настройках профиля + в меню паузы (⏸ в углу DuelScreen) без выхода из поединка.

**Тренировочный режим:** тот же DuelScreen с флагом `training: true` — играет с «соломенным вратарём», не списывает попытки и не сохраняет прогресс. Запускается из экрана настроек управления кнопкой «Попробовать».

### 5.4 Адаптация под десктоп

- Ширина ≥768px → вокруг игры рамка 390×844, фон затемнён.
- PixiJS и жесты работают одинаково с мышью и пальцем (`pointer*` события).
- Весь UI верстается под 390px как базу; на десктопе центрируется в рамке.

### 5.5 PWA

- Манифест: иконки 192/512, theme_color, display: standalone, orientation: portrait.
- Service worker через `vite-plugin-pwa`:
  - Статика (JS/CSS/иконки/спрайты) — кэш-первый.
  - API-запросы — только сеть, никакого офлайн-фейка игровой логики.
- Промпт «Добавить на главный экран» — стандартный beforeinstallprompt.

---

## 6. Модель данных

### 6.1 Каталог вратарей (balance/goalies.ts)

| # | ID | Имя | Паттерн | HP | Base reward/гол | First-clear |
|---|----|----|----|----|----|----|
| 1 | rookie | Новичок | linear | 5 | 1 | 20 |
| 2 | wall | Стена | linear | 8 | 1 | 40 |
| 3 | quickfoot | Быстрые ноги | linear | 12 | 2 | 80 |
| 4 | octopus | Осьминог | sine | 15 | 2 | 120 + Юниорская клюшка |
| 5 | dasher | Рывок | dash | 20 | 3 | 200 |
| 6 | snowstorm | Метель | sine | 25 | 3 | 300 |
| 7 | trickster | Финтарь | feint | 30 | 4 | 500 + Профессиональная клюшка |
| 8 | iceking | Ледяной Король | feint | 40 | 5 | 800 |
| 9 | shadow | Тень | dash | 45 | 6 | 1200 |
| 10 | legend | Легенда | feint+sine | 50 | 8 | 2000 + Легендарная «Сокол» |

Открытие следующего вратаря — после первого клира предыдущего. Фарм пройденных — без `firstClearBonus`.

### 6.2 Каталог клюшек (balance/sticks.ts)

| Stick | Редкость | Получение | Эффекты |
|---|---|---|---|
| Тренировочная | Обычная | Стартовая | нет |
| Юниорская | Редкая | Дроп за первый клир Осьминога | +10% к «хорошей зоне» попадания |
| Профессиональная | Эпическая | Дроп за первый клир Финтаря **или** 2000 шайб в магазине | +20% зоны + ×1.2 шайбы за гол |
| Легендарная «Сокол» | Легендарная | Дроп за первый клир Легенды | +30% зоны + ×1.5 шайбы + стрик растёт ×1.5 |

Эффекты — три числа: `shotZoneMultiplier`, `rewardMultiplier`, `streakGrowthMultiplier`. Применяются в `resolveShot` и `calcRewards`.

Поля «на вырост» в типе `Stick`: `level?`, `sockets?`, `setId?` — в MVP не используются, но есть в типе, чтобы Фаза 2 не ломала API.

### 6.3 Формулы экономики

**Восстановление попыток:** 1 попытка каждые 36 минут (25 за 15 часов). Аптечка на 24 часа ускоряет до 1/24 мин (эквивалент 10 часов полного восстановления). Расчёт лениво при каждом запросе `/wallet`: `delta_shots = floor((now - shots_updated_at) / interval)`, `shots_updated_at += delta_shots * interval`.

**Потолок попыток:** базовый 25. Первый приглашённый друг даёт +5 к потолку (итого 30). Второй, третий — по +5 (до абсолютного максимума 40 на четвёртом друге). Дальнейшие приглашения дают разовую награду +50 шайб за каждого, без изменения потолка.

**Награда за гол:**
```
reward = goalieBaseReward[goalieId] 
       * stickRewardMultiplier 
       * (1 + min(currentStreak * 0.1, 1.0))
```
Промах сбрасывает стрик. Выход из поединка сбрасывает стрик, но сохраняет HP прогресс.

**Колесо удачи:** 2 бесплатных вращения в день, сектора: 5/8/10/15/18/20 шайб + редкие сектора: +5 попыток / бонус-множитель наград на час. Дополнительные вращения покупаются за шайбы.

### 6.4 Схема PostgreSQL

```sql
-- Пользователи
users (
  id uuid primary key,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  level int not null default 1,      -- Фаза 2, задел
  xp int not null default 0          -- Фаза 2, задел
)

-- OAuth (TG + VK одновременно возможны)
auth_providers (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('telegram','vk')),
  provider_uid text not null,
  provider_data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (provider, provider_uid)
)

-- Кошелёк
user_wallet (
  user_id uuid primary key references users(id) on delete cascade,
  shots_current int not null default 25,
  shots_max int not null default 25,
  shots_bonus int not null default 0,
  shots_updated_at timestamptz not null default now(),
  pucks bigint not null default 0,
  gold_pucks bigint not null default 0,   -- Фаза 2, задел
  medkit_until timestamptz,
  wheel_spins int not null default 2,
  training_energy int not null default 0  -- Фаза 2, задел
)

-- Прогресс по вратарям
goalie_progress (
  user_id uuid references users(id) on delete cascade,
  goalie_id text not null,
  hp_left int not null,
  total_shots int not null default 0,
  total_goals int not null default 0,
  best_streak int not null default 0,
  current_streak int not null default 0,
  first_cleared_at timestamptz,
  primary key (user_id, goalie_id)
)

-- Сессии поединков
duel_sessions (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  goalie_id text not null,
  seed text not null,
  shot_index int not null default 0,
  game_core_version int not null,
  status text not null check (status in ('active','closed')),
  started_at timestamptz not null default now(),
  last_shot_at timestamptz,
  closed_at timestamptz
);
create index on duel_sessions (user_id, status) where status = 'active';

-- Клюшки
user_sticks (
  user_id uuid references users(id) on delete cascade,
  stick_id text not null,
  acquired_at timestamptz not null default now(),
  primary key (user_id, stick_id)
)

user_equipment (
  user_id uuid primary key references users(id) on delete cascade,
  equipped_stick text not null default 'training'
)

-- Друзья
user_friends (
  user_id uuid references users(id) on delete cascade,
  friend_user_id uuid references users(id) on delete cascade,
  source text not null check (source in ('invite','mutual')),
  created_at timestamptz not null default now(),
  primary key (user_id, friend_user_id)
)

invite_codes (
  code text primary key,
  user_id uuid not null references users(id) on delete cascade,
  uses int not null default 0,
  created_at timestamptz not null default now()
)

-- Лог событий (аудит, аналитика, анти-чит)
event_log (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  type text not null,              -- shot, goal, clear, reward, purchase, login, shot_mismatch
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index on event_log (user_id, created_at desc);
create index on event_log (type, created_at desc);
```

### 6.5 Redis

- `leaderboard:global` — sorted set, `ZADD … totalGoals userId`.
- `session:{sessionId}` — JSON активной сессии, TTL 2 часа, продлевается каждым броском.
- `rl:shot:{userId}` — rate limit, INCR + EXPIRE 1с.
- `user:{userId}:wallet` — кэш кошелька, инвалидируется при изменениях.
- `refresh:{jti}` — refresh-токены, TTL 30 дней.

**Принцип:** Postgres — истина, Redis — ускоритель. Все критичные операции (списание попыток, выдача наград) пишутся в транзакции Postgres, Redis обновляется вторым шагом.

---

## 7. Бэкенд API

### 7.1 Маршруты

```
# Auth
POST /auth/telegram         # проверка hash Login Widget, issue JWT
GET  /auth/vk/start         # → 302 на oauth.vk.com
GET  /auth/vk/callback      # обмен code на токен, issue JWT
POST /auth/refresh
POST /auth/logout

# User
GET  /me                    # профиль + кошелёк + equipped
PATCH /me                   # display_name, avatar

# Duel
POST /duel/start            # { goalieId }
POST /duel/shot             # { sessionId, shotIndex, input }
POST /duel/exit             # { sessionId }
GET  /duel/goalies          # список вратарей + прогресс

# Economy
GET  /wallet                # с ленивым пересчётом энергии
POST /wheel/spin
POST /shop/buy              # { itemId }  — медкит, коробка шайб, профи-клюшка
POST /stick/equip           # { stickId }

# Leaderboard
GET  /leaderboard/global    # топ-100 + окно ±5 вокруг игрока
GET  /leaderboard/me

# Friends
POST /invite/create
POST /invite/redeem         # { code }
GET  /friends
```

### 7.2 Авторизация

**Telegram Login Widget:**
1. Фронт рендерит официальный виджет Telegram (скрипт с telegram.org).
2. После клика Telegram редиректит на `/auth/telegram?id=…&first_name=…&hash=…`.
3. Сервер проверяет `hash` через HMAC-SHA256 с секретом бота (алгоритм из документации Telegram).
4. Валидно → находим/создаём `users` + `auth_providers(provider='telegram')`, выдаём JWT.

**VK OAuth 2.0:**
1. Фронт → `/auth/vk/start` → 302 на `https://oauth.vk.com/authorize?…`.
2. VK → `/auth/vk/callback?code=…`.
3. Сервер обменивает `code` на `access_token` у VK API, запрашивает профиль, создаёт/находит пользователя, выдаёт JWT.

**JWT:**
- `access_token`: 15 минут, HttpOnly Secure SameSite=Lax cookie.
- `refresh_token`: 30 дней, ротация при каждом использовании, хранится в Redis для возможности отзыва.
- HS256, секрет из env.

**Middleware:**
- `authRequired` — проверка JWT → `req.user = { id }`.
- `rateLimit` — на `/duel/shot` и общий.
- CORS — строго с фронт-домена.
- Helmet-headers, CSRF double-submit cookie на POST/PATCH.

### 7.3 Критичная транзакция: /duel/shot

```ts
async function handleShot(userId, { sessionId, shotIndex, input }) {
  const result = await db.transaction(async (tx) => {
    const session = await tx.duelSessions.findActive(sessionId, userId);
    if (!session || session.shotIndex !== shotIndex) throw Conflict();

    await tx.wallet.spendShot(userId);  // или 409 если попыток нет

    const stick = await tx.equipment.getStick(userId);
    const serverResult = runShot({
      version: session.gameCoreVersion,
      seed: session.seed,
      shotIndex,
      stick,
      input,
    });

    const progress = await tx.goalieProgress.apply(
      userId, session.goalieId, serverResult
    );

    const rewards = calcRewards(serverResult, progress, stick);
    if (rewards.pucks) await tx.wallet.addPucks(userId, rewards.pucks);

    await tx.duelSessions.incrementShotIndex(sessionId);

    if (progress.hpLeft === 0) {
      await tx.duelSessions.close(sessionId);
      if (!progress.firstClearedAt) {
        await tx.stickReward.grantIfEligible(userId, session.goalieId);
        rewards.firstClearBonus = goalieBaseReward[session.goalieId] * 5;
        await tx.wallet.addPucks(userId, rewards.firstClearBonus);
      }
    }

    await tx.eventLog.insert({ userId, type: 'shot', payload: {...} });

    return { result: serverResult, progress, rewards };
  });

  // Постобработка вне транзакции
  if (result.result.type === 'goal') {
    await redis.zincrby('leaderboard:global', 1, userId);
  }
  await invalidateWalletCache(userId);

  return result;
}
```

### 7.4 Наблюдаемость

- `pino` JSON-логи, каждый запрос с `requestId`, каждый хендлер с `userId`.
- `fastify-metrics` → Prometheus-совместимый `/metrics`.
- Алерт на `shot_mismatch`: если у одного игрока > N расхождений за сутки → лог + нотификация разработчику.

---

## 8. Тестирование

### 8.1 `game-core`

- **Юниты (Vitest):** каждая функция — `simulateGoalie`, `resolveShot`, `calcRewards`, каждый паттерн (linear/sine/dash/feint). Граничные кейсы: нулевая сила, максимальный угол, тайминг на грани.
- **Property tests (fast-check):** главное свойство — детерминизм. Для любых `(seed, shotIndex, input)` повторный вызов `resolveShot` даёт тот же результат. 1000 прогонов в CI.
- **Снапшоты полных поединков:** зафиксированные сценарии (20 бросков с конкретными входами, seed=X) → проверяем итоговый `GoalieProgress`. Гарантия стабильности баланса.

### 8.2 `server`

- Интеграционные тесты через `fastify.inject` + testcontainers (Postgres + Redis).
- Сценарии: `/duel/start` → `/duel/shot` × N → `/duel/exit`, транзакционность списания, конфликты `shotIndex`, rate limit.
- Тест «читер»: клиент шлёт результат, отличный от серверного → 409, попытка списана, `event_log` содержит `shot_mismatch`.

### 8.3 `web`

- React-компоненты — smoke-тесты (Vitest + Testing Library): рендер, клики по основным экранам.
- Игровой канвас юнитами не тестируется — вся логика в `game-core`.
- E2E через Playwright на 3-5 золотых сценариев: логин → поединок → бросок → результат → лидерборд.

### 8.4 CI

- PR: lint + typecheck + тесты всех пакетов + build `web`.
- Main: + деплой через SSH, Drizzle миграции перед рестартом.

---

## 9. Деплой

- Один VPS, Docker Compose:
  - `caddy` — TLS через Let's Encrypt, reverse proxy.
  - `server` — Fastify приложение.
  - `postgres:16` — с volume.
  - `redis:7` — с volume.
  - `web` — nginx, раздаёт статику Vite-билда.
- Секреты в `.env` на сервере, в GitHub Actions через Secrets.
- Домены: `app.yourhockey.ru` (фронт + API через `/api`) или раздельно `api.yourhockey.ru`.
- Бэкапы Postgres: ежедневно `pg_dump` на отдельный volume, еженедельно → S3-совместимое хранилище.

---

## 10. Оценка сроков

Один разработчик, фуллтайм:

| Неделя | Работа |
|---|---|
| 1 | Сетап монорепо, CI, Docker, Fastify-заготовка, OAuth TG+VK, `/me`, JWT |
| 2 | `game-core`: детерминированный движок, 4 паттерна, `resolveShot`, 10 боссов |
| 3 | `web`: PixiJS интеграция, DuelScreen, DragInput, базовый UI (профиль/меню/рейтинг) |
| 4 | `web`: TapHoldInput, SwipeInput, переключение управления, экран настроек |
| 5 | Экономика: попытки, восстановление, колесо удачи, shop, инвайты, лидерборд |
| 6 | Клюшки: каталог, применение эффектов в `game-core`, экран экипировки |
| 7 | Тесты (юнит + интеграция + E2E), баланс, багфикс |
| 8 | Закрытый бета-тест с друзьями, деплой на прод, мониторинг |

**Итого MVP: ~8 недель чистого времени, 10–12 недель с накладными.**

---

## 11. Риски и открытые вопросы

**Риски:**
- **Детерминизм между средами.** Плавающая точка в Node и браузерах теоретически должна совпадать для базовых операций, но экзотические функции (`Math.sin`, `Math.atan2`) могут дать расхождение. Митигация: property-тесты на кросс-средовую одинаковость (запуск `game-core` в тестах под Vitest как в Node-режиме, так и в jsdom).
- **Монетизация в РФ.** В MVP монетизации нет, но при переходе к Фазе 2 (ЮKassa, золотые шайбы) потребуется самозанятый/ИП, оферта, чеки через онлайн-кассу. Решается отдельно перед Фазой 2.
- **Первые игроки.** PWA без встроенной виральности мессенджера означает, что трафик придётся генерировать вручную (друзья, соцсети, реклама). Это риск продуктовый, не технический.

**Открытые вопросы (решаются до имплементации):**
- Дизайн визуала — шрифты, палитра, иконки вратарей, спрайты катка. Пока ориентируемся на стиль OVI (синий/белый, минимализм).
- Домен и хостинг-провайдер.
- Telegram-бот для Login Widget — кто заводит, у кого access.

---

## 12. Связь с последующими фазами

**Фаза 2 — Прокачка и экипировка:**
- Полный инвентарь (коньки, перчатки, шлем).
- Прокачка хоккеиста (уровни, XP, характеристики).
- Тренировки как карта активностей.
- Магазин с премиум-валютой (золотые шайбы + ЮKassa).
- Батл-пасс.

**Фаза 3 — Социалка:**
- Команды, командный чат.
- Пользовательские турниры (команда vs команда, 1v1).
- Клановые рейды на мегавратарей.
- Командный рейтинг.
- Ставки внутренней валютой.

**Фаза 4 — Удержание и виральность:**
- Прогнозы на реальные матчи.
- Сезоны.
- Пуш-уведомления (Web Push).
- Расширенная реклама, реферальные программы.
- Telegram Mini App / VK Mini Apps оболочки.

Каждая фаза — отдельный дизайн-документ и отдельный имплементационный план.
