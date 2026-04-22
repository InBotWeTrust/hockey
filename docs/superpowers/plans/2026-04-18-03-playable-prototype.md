# Ultimate Hockey — План 3: Клиентский playable-прототип (training mode)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать так, чтобы на `https://hockey.inbotwetrust.ru` можно было зайти без логина, выбрать любого из 10 боссов и реально играть drag-and-release в окне браузера — вратарь движется, шайба летит, результат считается через `resolveShot` из `@hockey/game-core`. Никакого сервера, никакого persist, никаких попыток. Только тренировочный режим.

**Architecture:** React + Vite + react-router-dom для роутинга, PixiJS v8 для игровой сцены, Zustand для локального стейта поединка. Координатное пространство катка — `RINK` (390×700) из `@hockey/game-core`; Pixi-stage автоматически скейлит его под доступный viewport с сохранением пропорций. Вся игровая логика идёт через `simulateGoalie` / `resolveShot` / `GOALIES` — web ничего не пересчитывает сам, только рендерит и собирает `ShotInput`. Версию `GAME_CORE_VERSION` web импортит как есть и не трогает.

**Tech Stack:** React 18, Vite 5, PixiJS 8, Zustand 4, react-router-dom 6, vitest + Testing Library.

**Связанный спек:** [2026-04-12-ultimate-hockey-pwa-mvp-design.md](../specs/2026-04-12-ultimate-hockey-pwa-mvp-design.md), разделы §5.1–§5.4, §4.3 (клиентская половина гибридной симуляции).

**Предыдущие планы:** [2026-04-12-01-skeleton.md](2026-04-12-01-skeleton.md), [2026-04-17-02-game-core.md](2026-04-17-02-game-core.md).

**Результат плана:**
- `pnpm dev:web` открывает страницу со списком 10 боссов → клик на босса → игровой экран с движущимся вратарём → drag по шайбе → результат (goal/save/miss) отрисован → счётчик голов и HP обновились.
- `pnpm --filter @hockey/web test` — все тесты зелёные: чистые модули (store, coordinates, input math) покрыты unit-тестами; smoke-тест Pixi-рендера подтверждает, что стадия инициализируется в jsdom без падений.
- `pnpm --filter @hockey/web build` проходит (tsc + vite build).
- CI зелёный, деплой через существующий GitHub Actions pipeline выкатывает новый образ web на `hockey.inbotwetrust.ru`.

---

## Предварительные условия

1. Plan 1 + Plan 2 выполнены. `pnpm test` зелёный на main. `@hockey/game-core` v2 опубликован в `dist/`.
2. Рабочая копия чистая, ветка — `main` или feature-ветка. Рекомендуется ветка `plan-3-playable`.
3. VPS и GitHub Actions deploy pipeline работают (Task 11 из Plan 1 выполнен).

---

## Scope fence

Явно НЕ входит в Plan 3, чтобы не расползались границы:

- Авторизация (Telegram/VK) — в следующий план.
- Сервер, Postgres, Redis, `/duel/*` эндпоинты — в следующий план.
- Экономика попыток, колесо удачи, магазин клюшек — в Plan 5+.
- Рейтинг, профиль, аватары — в Plan 5+.
- Все три механики управления. В Plan 3 — **только DragInput**.
- Три feint-босса всё ещё используют sine fallback (см. `simulate.ts` TODO). Реальный feint-паттерн — отдельной задачей потом, в этом плане мы его не трогаем. UI и игра работают корректно, просто feint визуально похож на sine.
- PWA, service worker, offline mode — в Plan 6.
- Меню паузы, переключение инпут-схем, звук — не в этом плане.

В Plan 3 должно быть достаточно, чтобы пощупать ключевую механику игры и дать команде прототип, по которому можно настраивать баланс.

---

## Структура файлов

К концу плана:

```
packages/web/
├── package.json                             # +pixi.js, zustand, react-router-dom
├── index.html                               # без изменений
├── src/
│   ├── main.tsx                             # Router mount
│   ├── app/
│   │   └── App.tsx                          # routes: / → GoalieList, /duel/:goalieId → Duel
│   ├── screens/
│   │   ├── GoalieListScreen.tsx             # сетка из 10 GOALIES, клик → navigate
│   │   ├── GoalieListScreen.test.tsx
│   │   ├── DuelScreen.tsx                   # контейнер: store + PixiStage + input
│   │   └── DuelScreen.test.tsx              # smoke: mount/unmount, HUD
│   ├── game/
│   │   ├── PixiStage.tsx                    # React wrapper над PixiJS Application
│   │   ├── PixiStage.test.tsx               # smoke: канвас появляется, cleanup на unmount
│   │   ├── coords.ts                        # rinkToScreen / screenToRink + тесты
│   │   ├── coords.test.ts
│   │   ├── loop.ts                          # per-frame: simulateGoalie → renderer.update
│   │   ├── renderer/
│   │   │   ├── Rink.ts                      # Graphics фон, разметка
│   │   │   ├── Goal.ts                      # Graphics ворот + штанг
│   │   │   ├── Goalie.ts                    # спрайт вратаря, update(state)
│   │   │   └── Puck.ts                      # спрайт шайбы + анимация полёта
│   │   └── input/
│   │       ├── InputAdapter.ts              # общий интерфейс
│   │       ├── DragInput.ts                 # drag-and-release
│   │       └── DragInput.test.ts            # unit-тест на math (angle/power)
│   └── stores/
│       ├── trainingStore.ts                 # zustand: currentGoalieId, hp, streak, shotIndex, sessionGoals, lastResult
│       └── trainingStore.test.ts
└── vitest.config.ts                          # без изменений (+pixi mock если потребуется)
```

Файл `packages/web/src/App.tsx` остаётся для обратной совместимости теста `App.test.tsx`, но `main.tsx` больше его не монтирует. Тест переписывается в Task 3.

---

## Замечание по TDD и Pixi

Pixi в jsdom работает частично: `new Application()` можно инициализировать, но `await app.init()` требует canvas. Все «математические» модули (coords, input, store) покрываем unit-тестами полноценно. Рендер-модули (`renderer/*`) — smoke-тестами уровня «конструктор не падает, update вызывается без ошибок». Полноценная проверка визуала — ручной smoke в `pnpm dev:web` в конце каждого соответствующего таска.

Коммиты частые: каждая задача — один коммит `feat(web): ...` или `test(web): ...`. Не смешиваем несколько задач в один коммит.

---

## Task 1: Зависимости и базовая структура папок

**Files:**
- Modify: `packages/web/package.json`
- Create: пустые `.gitkeep` или README-заглушки в новых директориях — **не нужно**, директории создаются вместе с первыми файлами в следующих задачах.

**Почему отдельно:** устанавливаем базу один раз, чтобы lockfile поднимался в одном коммите.

- [ ] **Step 1: Установить runtime-зависимости**

```bash
pnpm --filter @hockey/web add pixi.js@^8.2.0 zustand@^4.5.0 react-router-dom@^6.22.0
```

- [ ] **Step 2: Установить типы (react-router-dom поставляет свои)**

Дополнительных `@types/*` не требуется. Убедиться что `pnpm-lock.yaml` обновился.

- [ ] **Step 3: Проверить что typecheck всё ещё проходит**

Run: `pnpm --filter @hockey/web typecheck`
Expected: без ошибок.

- [ ] **Step 4: Коммит**

```bash
git add packages/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add pixi.js, zustand, react-router-dom"
```

---

## Task 2: `stores/trainingStore.ts` — локальный стейт поединка

**Files:**
- Create: `packages/web/src/stores/trainingStore.ts`
- Create: `packages/web/src/stores/trainingStore.test.ts`

Стор — единственный источник правды для текущего поединка в Plan 3. Хранит: что играем, сколько HP осталось, текущий стрик, `shotIndex`, последний результат, счётчик голов/промахов за сессию. Ничего не персистит.

- [ ] **Step 1: Тест `trainingStore.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useTrainingStore } from './trainingStore.js';
import { GOALIES } from '@hockey/game-core';

describe('trainingStore', () => {
  beforeEach(() => {
    useTrainingStore.getState().reset();
  });

  it('starts empty before startDuel', () => {
    const s = useTrainingStore.getState();
    expect(s.currentGoalieId).toBeNull();
    expect(s.hpLeft).toBe(0);
    expect(s.shotIndex).toBe(0);
    expect(s.streak).toBe(0);
    expect(s.sessionGoals).toBe(0);
    expect(s.sessionMisses).toBe(0);
    expect(s.lastResult).toBeNull();
  });

  it('startDuel seeds hp from goalie config and resets counters', () => {
    const rookie = GOALIES[0]!;
    useTrainingStore.getState().startDuel(rookie.id);
    const s = useTrainingStore.getState();
    expect(s.currentGoalieId).toBe(rookie.id);
    expect(s.hpLeft).toBe(rookie.hp);
    expect(s.shotIndex).toBe(0);
    expect(s.streak).toBe(0);
    expect(s.seed).toMatch(/^training:rookie:/); // seeded per duel
  });

  it('applyResult goal decrements hp, increments streak and goals', () => {
    useTrainingStore.getState().startDuel('rookie');
    useTrainingStore.getState().applyResult({ type: 'goal', hitPoint: { x: 195, y: 60 } });
    const s = useTrainingStore.getState();
    expect(s.hpLeft).toBe(4);
    expect(s.streak).toBe(1);
    expect(s.sessionGoals).toBe(1);
    expect(s.shotIndex).toBe(1);
    expect(s.lastResult?.type).toBe('goal');
  });

  it('applyResult save resets streak but keeps hp', () => {
    useTrainingStore.getState().startDuel('rookie');
    useTrainingStore.getState().applyResult({ type: 'goal', hitPoint: { x: 195, y: 60 } });
    useTrainingStore.getState().applyResult({ type: 'save', goalieContact: { x: 195, y: 30 } });
    const s = useTrainingStore.getState();
    expect(s.hpLeft).toBe(4); // unchanged by save
    expect(s.streak).toBe(0);
    expect(s.sessionGoals).toBe(1);
    expect(s.shotIndex).toBe(2);
  });

  it('applyResult miss resets streak and counts as miss', () => {
    useTrainingStore.getState().startDuel('rookie');
    useTrainingStore.getState().applyResult({ type: 'goal', hitPoint: { x: 195, y: 60 } });
    useTrainingStore.getState().applyResult({ type: 'miss', reason: 'wide' });
    const s = useTrainingStore.getState();
    expect(s.streak).toBe(0);
    expect(s.sessionMisses).toBe(1);
  });

  it('clamps hp at zero when boss is defeated', () => {
    useTrainingStore.getState().startDuel('rookie'); // hp 5
    for (let i = 0; i < 7; i++) {
      useTrainingStore.getState().applyResult({ type: 'goal', hitPoint: { x: 195, y: 60 } });
    }
    expect(useTrainingStore.getState().hpLeft).toBe(0);
    expect(useTrainingStore.getState().isCleared).toBe(true);
  });
});
```

- [ ] **Step 2: Прогнать — тесты падают**

Run: `pnpm --filter @hockey/web test -- trainingStore`
Expected: FAIL (модуль не существует).

- [ ] **Step 3: Реализация `trainingStore.ts`**

```ts
import { create } from 'zustand';
import { GOALIES, getGoalie, type ShotResult } from '@hockey/game-core';

export interface TrainingState {
  currentGoalieId: string | null;
  seed: string;
  hpLeft: number;
  streak: number;
  shotIndex: number;
  sessionGoals: number;
  sessionMisses: number;
  lastResult: ShotResult | null;
  isCleared: boolean;

  startDuel: (goalieId: string) => void;
  applyResult: (result: ShotResult) => void;
  reset: () => void;
}

const EMPTY: Omit<TrainingState, 'startDuel' | 'applyResult' | 'reset'> = {
  currentGoalieId: null,
  seed: '',
  hpLeft: 0,
  streak: 0,
  shotIndex: 0,
  sessionGoals: 0,
  sessionMisses: 0,
  lastResult: null,
  isCleared: false,
};

export const useTrainingStore = create<TrainingState>((set, get) => ({
  ...EMPTY,
  startDuel: (goalieId) => {
    const cfg = getGoalie(goalieId);
    // Seed включает id босса и монотонную метку — даёт детерминированный поток
    // в пределах сессии, но меняется между перезапусками, чтобы тренировка
    // не была one-shot заучиваемой.
    const seed = `training:${cfg.id}:${Date.now().toString(36)}`;
    set({
      ...EMPTY,
      currentGoalieId: cfg.id,
      seed,
      hpLeft: cfg.hp,
    });
  },
  applyResult: (result) => {
    const st = get();
    if (!st.currentGoalieId) return;
    if (result.type === 'goal') {
      const nextHp = Math.max(0, st.hpLeft - 1);
      set({
        hpLeft: nextHp,
        streak: st.streak + 1,
        shotIndex: st.shotIndex + 1,
        sessionGoals: st.sessionGoals + 1,
        lastResult: result,
        isCleared: nextHp === 0,
      });
    } else if (result.type === 'save') {
      set({
        streak: 0,
        shotIndex: st.shotIndex + 1,
        lastResult: result,
      });
    } else {
      set({
        streak: 0,
        shotIndex: st.shotIndex + 1,
        sessionMisses: st.sessionMisses + 1,
        lastResult: result,
      });
    }
  },
  reset: () => set({ ...EMPTY }),
}));

// Guard: если кто-то забыл `reset` между тестами — каталог доступен всегда.
export const ALL_GOALIES = GOALIES;
```

- [ ] **Step 4: Прогнать — тесты зелёные**

Run: `pnpm --filter @hockey/web test -- trainingStore`
Expected: PASS (все 6 тестов).

- [ ] **Step 5: Коммит**

```bash
git add packages/web/src/stores/
git commit -m "feat(web): training store with hp/streak/shot index tracking"
```

---

## Task 3: Роутер + удалить старый App тест

**Files:**
- Create: `packages/web/src/app/App.tsx`
- Modify: `packages/web/src/main.tsx`
- Delete: `packages/web/src/App.tsx`, `packages/web/src/App.test.tsx`

Старая заглушка больше не нужна. Монтируем Router. Роутов пока два — `/` (будет GoalieList) и `/duel/:goalieId` (будет DuelScreen), но сами экраны — заглушки в этой задаче, чтобы роутинг и визуально и в тестах проверился отдельно.

- [ ] **Step 1: Создать `app/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';

function HomePlaceholder(): JSX.Element {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Ultimate Hockey — Training</h1>
      <p>Выбор вратарей появится в следующей задаче.</p>
      <Link to="/duel/rookie">→ Тестовый переход на бой с Новичком</Link>
    </main>
  );
}

function DuelPlaceholder(): JSX.Element {
  return <main style={{ padding: 24 }}>Duel placeholder</main>;
}

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePlaceholder />} />
        <Route path="/duel/:goalieId" element={<DuelPlaceholder />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Обновить `main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App.js';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 3: Удалить устаревшие файлы**

```bash
rm packages/web/src/App.tsx packages/web/src/App.test.tsx
```

- [ ] **Step 4: Тест роутинга `app/App.test.tsx`**

Создать файл `packages/web/src/app/App.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

function HomePlaceholder(): JSX.Element {
  return <main>Ultimate Hockey — Training</main>;
}
function DuelPlaceholder(): JSX.Element {
  return <main>Duel placeholder</main>;
}

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<HomePlaceholder />} />
        <Route path="/duel/:goalieId" element={<DuelPlaceholder />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('App routes', () => {
  it('renders home at /', () => {
    renderAt('/');
    expect(screen.getByText(/ultimate hockey/i)).toBeInTheDocument();
  });

  it('renders duel placeholder at /duel/:goalieId', () => {
    renderAt('/duel/rookie');
    expect(screen.getByText(/duel placeholder/i)).toBeInTheDocument();
  });
});
```

(Мы тестируем по копии роутов, а не импортируем `App` напрямую — `BrowserRouter` в jsdom требует больше настроек. Эта копия — lightweight проверка контракта.)

- [ ] **Step 5: Прогнать тесты**

Run: `pnpm --filter @hockey/web test`
Expected: PASS. Старый `App.test.tsx` исчез, новый `app/App.test.tsx` зелёный.

- [ ] **Step 6: Коммит**

```bash
git add packages/web/src/ packages/web/src/app/
git commit -m "feat(web): router scaffold with placeholder screens"
```

---

## Task 4: `game/coords.ts` — преобразования координат

**Files:**
- Create: `packages/web/src/game/coords.ts`
- Create: `packages/web/src/game/coords.test.ts`

Каток в координатах `RINK` (390×700). Pixi stage масштабируется под viewport с сохранением aspect ratio. Нам нужны конверсии туда-обратно: input адаптер получает CSS pixel координаты клика, а шлёт в `game-core` координаты катка.

- [ ] **Step 1: Тест `coords.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { RINK } from '@hockey/game-core';
import {
  computeScale,
  rinkToScreen,
  screenToRink,
  type Scale,
} from './coords.js';

describe('computeScale', () => {
  it('fits rink into 390x700 viewport 1:1', () => {
    const s = computeScale({ width: 390, height: 700 });
    expect(s.factor).toBe(1);
    expect(s.offsetX).toBe(0);
    expect(s.offsetY).toBe(0);
  });

  it('scales uniformly and centers when viewport wider than rink', () => {
    const s = computeScale({ width: 780, height: 700 });
    expect(s.factor).toBe(1); // height is the bottleneck
    expect(s.offsetX).toBe((780 - 390) / 2);
    expect(s.offsetY).toBe(0);
  });

  it('scales uniformly and centers when viewport taller than rink', () => {
    const s = computeScale({ width: 390, height: 1400 });
    expect(s.factor).toBe(1); // width is the bottleneck
    expect(s.offsetY).toBe((1400 - 700) / 2);
  });

  it('shrinks when viewport smaller', () => {
    const s = computeScale({ width: 195, height: 350 });
    expect(s.factor).toBe(0.5);
  });
});

describe('rinkToScreen / screenToRink', () => {
  const scale: Scale = { factor: 0.5, offsetX: 10, offsetY: 20 };

  it('rinkToScreen maps origin', () => {
    expect(rinkToScreen({ x: 0, y: 0 }, scale)).toEqual({ x: 10, y: 20 });
  });

  it('round-trips a rink-space point', () => {
    const p = { x: 195, y: 660 }; // puck start
    const screen = rinkToScreen(p, scale);
    const back = screenToRink(screen, scale);
    expect(back.x).toBeCloseTo(p.x, 6);
    expect(back.y).toBeCloseTo(p.y, 6);
  });

  it('RINK corners map within viewport bounds', () => {
    const s = computeScale({ width: 780, height: 700 });
    const bottomRight = rinkToScreen({ x: RINK.width, y: RINK.height }, s);
    expect(bottomRight.x).toBeLessThanOrEqual(780);
    expect(bottomRight.y).toBeLessThanOrEqual(700);
  });
});
```

- [ ] **Step 2: Прогнать — падает**

Run: `pnpm --filter @hockey/web test -- coords`
Expected: FAIL (модуль не существует).

- [ ] **Step 3: Реализация `coords.ts`**

```ts
import { RINK, type Vec2 } from '@hockey/game-core';

export interface Scale {
  factor: number;
  offsetX: number;
  offsetY: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export function computeScale(vp: Viewport): Scale {
  const factor = Math.min(vp.width / RINK.width, vp.height / RINK.height);
  const offsetX = (vp.width - RINK.width * factor) / 2;
  const offsetY = (vp.height - RINK.height * factor) / 2;
  return { factor, offsetX, offsetY };
}

export function rinkToScreen(p: Vec2, s: Scale): Vec2 {
  return {
    x: p.x * s.factor + s.offsetX,
    y: p.y * s.factor + s.offsetY,
  };
}

export function screenToRink(p: Vec2, s: Scale): Vec2 {
  return {
    x: (p.x - s.offsetX) / s.factor,
    y: (p.y - s.offsetY) / s.factor,
  };
}
```

- [ ] **Step 4: Прогнать — зелёные**

Run: `pnpm --filter @hockey/web test -- coords`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add packages/web/src/game/coords.ts packages/web/src/game/coords.test.ts
git commit -m "feat(web): rink<->screen coordinate transforms"
```

---

## Task 5: `game/PixiStage.tsx` — React-обёртка над Pixi Application

**Files:**
- Create: `packages/web/src/game/PixiStage.tsx`
- Create: `packages/web/src/game/PixiStage.test.tsx`

Компонент монтирует PixiJS `Application` в `<div ref>`, инициализирует, слушает resize, пересчитывает `Scale`, и на unmount — `app.destroy()`. Наружу отдаёт callbacks: `onReady(app, scale)`, `onResize(scale)`.

- [ ] **Step 1: Smoke-тест `PixiStage.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { PixiStage } from './PixiStage.js';

describe('PixiStage', () => {
  it('mounts without throwing and calls onReady', async () => {
    const onReady = vi.fn();
    render(<PixiStage onReady={onReady} onResize={() => {}} />);
    // Wait a microtask — PixiStage awaits app.init()
    await new Promise((r) => setTimeout(r, 50));
    expect(onReady).toHaveBeenCalled();
    cleanup();
  });

  it('inserts a canvas into the DOM', async () => {
    const { container } = render(
      <PixiStage onReady={() => {}} onResize={() => {}} />,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('canvas')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Прогнать — падает**

Run: `pnpm --filter @hockey/web test -- PixiStage`
Expected: FAIL (модуль не существует).

- [ ] **Step 3: Реализация**

```tsx
import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import { computeScale, type Scale } from './coords.js';

export interface PixiStageProps {
  onReady: (app: Application, scale: Scale) => void;
  onResize: (scale: Scale) => void;
}

export function PixiStage({ onReady, onResize }: PixiStageProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const app = new Application();
    let disposed = false;

    const measure = (): Scale =>
      computeScale({ width: host.clientWidth, height: host.clientHeight });

    (async () => {
      await app.init({
        background: '#0b2e5c',
        resizeTo: host,
        antialias: true,
      });
      if (disposed) {
        app.destroy(true, { children: true });
        return;
      }
      host.appendChild(app.canvas);
      onReady(app, measure());
    })();

    const ro = new ResizeObserver(() => {
      if (disposed) return;
      onResize(measure());
    });
    ro.observe(host);

    return () => {
      disposed = true;
      ro.disconnect();
      // destroy is safe even if init did not finish yet in pixi v8
      try {
        app.destroy(true, { children: true });
      } catch {
        /* ignore */
      }
    };
  }, [onReady, onResize]);

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />;
}
```

- [ ] **Step 4: Если smoke-тест падает в jsdom**

Pixi v8 в jsdom требует `HTMLCanvasElement.prototype.getContext` заглушки. В этом случае добавь в `packages/web/src/test-setup.ts`:

```ts
import '@testing-library/jest-dom';

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = HTMLCanvasElement.prototype.getContext
    ?? (() => null as unknown as CanvasRenderingContext2D);
}
```

и в `vitest.config.ts` уже зарегистрирован `setupFiles`. Больше ничего не нужно.

Если Pixi упорно падает в jsdom даже с заглушкой — мокни его в тесте:

```tsx
vi.mock('pixi.js', () => ({
  Application: class {
    canvas = document.createElement('canvas');
    stage = { addChild: () => {}, removeChildren: () => {} };
    init = async () => {};
    destroy = () => {};
    ticker = { add: () => {}, remove: () => {} };
  },
}));
```

Цель smoke-теста — убедиться что компонент монтируется и размонтируется без исключений, НЕ проверить реальный WebGL рендер.

- [ ] **Step 5: Прогнать — зелёные**

Run: `pnpm --filter @hockey/web test -- PixiStage`
Expected: PASS.

- [ ] **Step 6: Коммит**

```bash
git add packages/web/src/game/PixiStage.tsx packages/web/src/game/PixiStage.test.tsx packages/web/src/test-setup.ts
git commit -m "feat(web): PixiStage React wrapper with resize + cleanup"
```

---

## Task 6: Renderer — Rink и Goal

**Files:**
- Create: `packages/web/src/game/renderer/Rink.ts`
- Create: `packages/web/src/game/renderer/Goal.ts`

Чистая отрисовка — static Graphics. Обновляются только при ресайзе (пересчёт скейла). Никаких тестов для них — они чисто визуальные; проверка в ручном smoke.

- [ ] **Step 1: `Rink.ts`**

```ts
import { Container, Graphics } from 'pixi.js';
import { RINK } from '@hockey/game-core';
import type { Scale } from '../coords.js';

export class Rink {
  readonly container = new Container();
  private readonly bg = new Graphics();
  private readonly centerLine = new Graphics();

  constructor() {
    this.container.addChild(this.bg);
    this.container.addChild(this.centerLine);
  }

  update(scale: Scale): void {
    const w = RINK.width * scale.factor;
    const h = RINK.height * scale.factor;

    this.bg.clear();
    this.bg.roundRect(0, 0, w, h, 24 * scale.factor).fill(0xe6f1ff).stroke({
      color: 0x6aa7ff,
      width: 2 * scale.factor,
    });

    this.centerLine.clear();
    this.centerLine
      .moveTo(0, h / 2)
      .lineTo(w, h / 2)
      .stroke({ color: 0xff5a5a, width: 2 * scale.factor });

    this.container.position.set(scale.offsetX, scale.offsetY);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
```

- [ ] **Step 2: `Goal.ts`**

```ts
import { Container, Graphics } from 'pixi.js';
import { GOAL } from '@hockey/game-core';
import type { Scale } from '../coords.js';

export class Goal {
  readonly container = new Container();
  private readonly net = new Graphics();
  private readonly posts = new Graphics();

  constructor() {
    this.container.addChild(this.net);
    this.container.addChild(this.posts);
  }

  update(scale: Scale): void {
    const toX = (x: number): number => x * scale.factor;
    const toY = (y: number): number => y * scale.factor;

    this.net.clear();
    this.net
      .rect(toX(GOAL.x), toY(GOAL.y), toX(GOAL.width), toY(GOAL.height))
      .fill({ color: 0xffffff, alpha: 0.55 })
      .stroke({ color: 0x0b2e5c, width: 2 * scale.factor });

    this.posts.clear();
    for (const post of [GOAL.leftPost, GOAL.rightPost]) {
      this.posts
        .rect(toX(post.x), toY(post.y), toX(post.width), toY(post.height))
        .fill(0xff0000);
    }

    this.container.position.set(scale.offsetX, scale.offsetY);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @hockey/web typecheck`
Expected: без ошибок.

- [ ] **Step 4: Коммит**

```bash
git add packages/web/src/game/renderer/Rink.ts packages/web/src/game/renderer/Goal.ts
git commit -m "feat(web): Rink and Goal renderers"
```

---

## Task 7: Renderer — Goalie и Puck

**Files:**
- Create: `packages/web/src/game/renderer/Goalie.ts`
- Create: `packages/web/src/game/renderer/Puck.ts`

Goalie рисуется как закруглённый прямоугольник (`GOALIE_SIZE`). Обновляется каждый кадр — `update(state, scale)`. Puck — круг радиуса ~8. Анимация полёта в Plan 3 — простая интерполяция за 300ms от start до end траектории, настраиваемая в `playShot()`.

- [ ] **Step 1: `Goalie.ts`**

```ts
import { Container, Graphics } from 'pixi.js';
import type { GoalieState } from '@hockey/game-core';
import type { Scale } from '../coords.js';

export class Goalie {
  readonly container = new Container();
  private readonly body = new Graphics();

  constructor() {
    this.container.addChild(this.body);
  }

  update(state: GoalieState, scale: Scale): void {
    const w = state.width * scale.factor;
    const h = state.height * scale.factor;

    this.body.clear();
    this.body
      .roundRect(-w / 2, -h / 2, w, h, 6 * scale.factor)
      .fill(0x0b2e5c)
      .stroke({ color: 0xffffff, width: 2 * scale.factor });

    this.container.position.set(
      state.position.x * scale.factor + scale.offsetX,
      state.position.y * scale.factor + scale.offsetY,
    );
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
```

- [ ] **Step 2: `Puck.ts`**

```ts
import { Container, Graphics } from 'pixi.js';
import { PUCK_START, type Vec2 } from '@hockey/game-core';
import type { Scale } from '../coords.js';

const PUCK_RADIUS = 8;

export class Puck {
  readonly container = new Container();
  private readonly body = new Graphics();
  private flight: {
    start: Vec2;
    end: Vec2;
    startedAt: number;
    durationMs: number;
  } | null = null;

  constructor() {
    this.container.addChild(this.body);
  }

  resetAtStart(scale: Scale): void {
    this.flight = null;
    this.draw(PUCK_START, scale);
  }

  playShot(start: Vec2, end: Vec2, now: number, durationMs = 300): void {
    this.flight = { start, end, startedAt: now, durationMs };
  }

  update(now: number, scale: Scale): void {
    if (!this.flight) return;
    const t = Math.min(1, (now - this.flight.startedAt) / this.flight.durationMs);
    const x = this.flight.start.x + (this.flight.end.x - this.flight.start.x) * t;
    const y = this.flight.start.y + (this.flight.end.y - this.flight.start.y) * t;
    this.draw({ x, y }, scale);
    if (t >= 1) this.flight = null;
  }

  isFlying(): boolean {
    return this.flight !== null;
  }

  private draw(p: Vec2, scale: Scale): void {
    this.body.clear();
    this.body
      .circle(0, 0, PUCK_RADIUS * scale.factor)
      .fill(0x111111)
      .stroke({ color: 0xffffff, width: 1.5 * scale.factor });
    this.container.position.set(
      p.x * scale.factor + scale.offsetX,
      p.y * scale.factor + scale.offsetY,
    );
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @hockey/web typecheck`
Expected: без ошибок.

- [ ] **Step 4: Коммит**

```bash
git add packages/web/src/game/renderer/Goalie.ts packages/web/src/game/renderer/Puck.ts
git commit -m "feat(web): Goalie and Puck renderers"
```

---

## Task 8: `game/loop.ts` — per-frame callback

**Files:**
- Create: `packages/web/src/game/loop.ts`

`loop.ts` экспортирует фабрику `createGameLoop(opts)`, которая возвращает объект с `attach(ticker)`, `detach()` и хранит актуальные `scale` + ссылки на renderer'ы. Каждый тик: берёт `t = performance.now() - sessionStart`, вызывает `simulateGoalie`, обновляет Goalie, обновляет Puck. Конкретно сюда кладётся оркестрация — renderer'ы чистые, store чистый, store ↔ game-core связка живёт здесь.

- [ ] **Step 1: Реализация `loop.ts`**

```ts
import type { Ticker } from 'pixi.js';
import { simulateGoalie, getGoalie, type GoalieState } from '@hockey/game-core';
import type { Scale } from './coords.js';
import type { Goalie } from './renderer/Goalie.js';
import type { Puck } from './renderer/Puck.js';

export interface GameLoopOpts {
  goalieRenderer: Goalie;
  puckRenderer: Puck;
  getScale: () => Scale;
  getSeed: () => string;
  getShotIndex: () => number;
  getGoalieId: () => string | null;
}

export interface GameLoop {
  attach: (ticker: Ticker) => void;
  detach: () => void;
  sessionStartMs: number;
}

export function createGameLoop(opts: GameLoopOpts): GameLoop {
  const sessionStartMs = performance.now();
  const onTick = (): void => {
    const id = opts.getGoalieId();
    if (!id) return;
    const cfg = getGoalie(id);
    const now = performance.now();
    const state: GoalieState = simulateGoalie(
      cfg,
      opts.getSeed(),
      opts.getShotIndex(),
      now - sessionStartMs,
    );
    const scale = opts.getScale();
    opts.goalieRenderer.update(state, scale);
    opts.puckRenderer.update(now, scale);
  };

  let attachedTo: Ticker | null = null;
  return {
    attach(ticker) {
      attachedTo = ticker;
      ticker.add(onTick);
    },
    detach() {
      attachedTo?.remove(onTick);
      attachedTo = null;
    },
    sessionStartMs,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @hockey/web typecheck`
Expected: без ошибок.

- [ ] **Step 3: Коммит**

```bash
git add packages/web/src/game/loop.ts
git commit -m "feat(web): per-frame game loop wiring"
```

---

## Task 9: `input/InputAdapter.ts` + `input/DragInput.ts`

**Files:**
- Create: `packages/web/src/game/input/InputAdapter.ts`
- Create: `packages/web/src/game/input/DragInput.ts`
- Create: `packages/web/src/game/input/DragInput.test.ts`

Интерфейс один на все инпуты (для будущего; в Plan 3 реализуем только Drag). Drag: `pointerdown` рядом с шайбой → `pointermove` трекает → `pointerup` вычисляет `angle` и `power` из вектора «откуда тянули».

Базовая математика: пользователь тянет ОТ шайбы (x=195, y=660) В сторону, противоположную броску. То есть если тянет вниз (y растёт) — бросок идёт вверх (у уменьшается). `angle = 0` означает «прямо к воротам» (вверх), положительный — вправо. `power = clamp(|drag_vec| / MAX_DRAG, 0, 1)`. `MAX_DRAG` в rink-координатах = 400 (около высоты катка).

- [ ] **Step 1: `InputAdapter.ts`**

```ts
import type { ShotInput } from '@hockey/game-core';

export interface InputAdapter {
  attach: (
    canvas: HTMLCanvasElement,
    getScale: () => import('../coords.js').Scale,
    onShot: (input: ShotInput) => void,
  ) => void;
  detach: () => void;
}
```

- [ ] **Step 2: Тест `DragInput.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { computeShotFromDrag, MAX_DRAG } from './DragInput.js';

describe('computeShotFromDrag', () => {
  it('straight-down drag (away from goal) produces angle≈0 (straight up shot)', () => {
    const input = computeShotFromDrag(
      { x: 195, y: 660 }, // start = puck
      { x: 195, y: 860 }, // drag 200px down
      0,
    );
    expect(input.angle).toBeCloseTo(0, 5);
    expect(input.power).toBeCloseTo(200 / MAX_DRAG, 5);
  });

  it('drag down-and-right produces left-angled shot (negative angle)', () => {
    const input = computeShotFromDrag({ x: 195, y: 660 }, { x: 295, y: 760 }, 0);
    expect(input.angle).toBeLessThan(0);
    expect(input.power).toBeGreaterThan(0);
  });

  it('drag down-and-left produces right-angled shot (positive angle)', () => {
    const input = computeShotFromDrag({ x: 195, y: 660 }, { x: 95, y: 760 }, 0);
    expect(input.angle).toBeGreaterThan(0);
  });

  it('power clamped at 1 for very long drags', () => {
    const input = computeShotFromDrag(
      { x: 195, y: 660 },
      { x: 195, y: 660 + MAX_DRAG * 3 },
      0,
    );
    expect(input.power).toBe(1);
  });

  it('tiny drag produces tiny power (may be below MIN_POWER)', () => {
    const input = computeShotFromDrag({ x: 195, y: 660 }, { x: 195, y: 665 }, 0);
    expect(input.power).toBeLessThan(0.1);
  });

  it('passes releaseTime through', () => {
    const input = computeShotFromDrag({ x: 0, y: 0 }, { x: 0, y: 100 }, 12345);
    expect(input.releaseTime).toBe(12345);
  });
});
```

- [ ] **Step 3: Прогнать — падает**

Run: `pnpm --filter @hockey/web test -- DragInput`
Expected: FAIL (модуль не существует).

- [ ] **Step 4: Реализация `DragInput.ts`**

```ts
import type { ShotInput, Vec2 } from '@hockey/game-core';
import { PUCK_START } from '@hockey/game-core';
import type { InputAdapter } from './InputAdapter.js';
import type { Scale } from '../coords.js';
import { screenToRink } from '../coords.js';

export const MAX_DRAG = 400; // rink units

const PUCK_HIT_RADIUS_RINK = 40; // forgiving pickup zone

export function computeShotFromDrag(
  startRink: Vec2,
  endRink: Vec2,
  releaseTime: number,
): ShotInput {
  // Player drags AWAY from the puck. Shot vector = -drag.
  const dragX = endRink.x - startRink.x;
  const dragY = endRink.y - startRink.y;
  const shotX = -dragX;
  const shotY = -dragY;
  // angle: 0 = straight up. atan2(x, -y) because our y grows downward
  // and "up" is the zero direction.
  const angle = Math.atan2(shotX, -shotY);
  const length = Math.hypot(dragX, dragY);
  const power = Math.max(0, Math.min(1, length / MAX_DRAG));
  return { angle, power, releaseTime };
}

export function createDragInput(): InputAdapter {
  let canvas: HTMLCanvasElement | null = null;
  let scaleGetter: (() => Scale) | null = null;
  let onShot: ((input: ShotInput) => void) | null = null;
  let dragStartRink: Vec2 | null = null;

  const toRink = (ev: PointerEvent): Vec2 | null => {
    if (!canvas || !scaleGetter) return null;
    const rect = canvas.getBoundingClientRect();
    return screenToRink(
      { x: ev.clientX - rect.left, y: ev.clientY - rect.top },
      scaleGetter(),
    );
  };

  const onDown = (ev: PointerEvent): void => {
    const p = toRink(ev);
    if (!p) return;
    const dx = p.x - PUCK_START.x;
    const dy = p.y - PUCK_START.y;
    if (Math.hypot(dx, dy) > PUCK_HIT_RADIUS_RINK) return;
    dragStartRink = p;
    canvas?.setPointerCapture(ev.pointerId);
  };

  const onUp = (ev: PointerEvent): void => {
    if (!dragStartRink) return;
    const end = toRink(ev);
    if (!end || !onShot) {
      dragStartRink = null;
      return;
    }
    onShot(computeShotFromDrag(dragStartRink, end, performance.now()));
    dragStartRink = null;
    canvas?.releasePointerCapture(ev.pointerId);
  };

  return {
    attach(c, getScale, cb) {
      canvas = c;
      scaleGetter = getScale;
      onShot = cb;
      c.addEventListener('pointerdown', onDown);
      c.addEventListener('pointerup', onUp);
      c.addEventListener('pointercancel', onUp);
    },
    detach() {
      canvas?.removeEventListener('pointerdown', onDown);
      canvas?.removeEventListener('pointerup', onUp);
      canvas?.removeEventListener('pointercancel', onUp);
      canvas = null;
      scaleGetter = null;
      onShot = null;
      dragStartRink = null;
    },
  };
}
```

- [ ] **Step 5: Прогнать — зелёные**

Run: `pnpm --filter @hockey/web test -- DragInput`
Expected: PASS.

- [ ] **Step 6: Коммит**

```bash
git add packages/web/src/game/input/
git commit -m "feat(web): drag-and-release input adapter"
```

---

## Task 10: `screens/DuelScreen.tsx` — связка всего вместе

**Files:**
- Create: `packages/web/src/screens/DuelScreen.tsx`
- Create: `packages/web/src/screens/DuelScreen.test.tsx`
- Modify: `packages/web/src/app/App.tsx` (подключить DuelScreen вместо placeholder)

Это экран поединка. Роут `/duel/:goalieId`. На mount:
1. Парсит `goalieId` из URL, валидирует через `getGoalie`.
2. `useTrainingStore.startDuel(goalieId)`.
3. Монтирует `PixiStage`. В `onReady(app, scale)` создаёт renderer'ы, добавляет в `app.stage`, создаёт `createGameLoop`, `loop.attach(app.ticker)`, создаёт `createDragInput().attach(app.canvas, getScale, onShot)`.
4. `onShot(input)`: берёт текущий `GoalieState` через `simulateGoalie`, зовёт `resolveShot(input, state, STICK_NEUTRAL)`, анимирует полёт шайбы (`puck.playShot`), обновляет store через `applyResult(result)`, через 300ms сбрасывает шайбу (`puck.resetAtStart`).
5. HUD: имя босса, HP bar, стрик, счётчик голов/промахов сессии, кнопка «Назад». При `isCleared === true` показывает overlay «Босс повержен» с кнопкой «Ещё раз».

- [ ] **Step 1: Реализация `DuelScreen.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import type { Application } from 'pixi.js';
import {
  getGoalie,
  simulateGoalie,
  resolveShot,
  computeTrajectory,
  STICK_NEUTRAL,
  type ShotInput,
  type ShotResult,
} from '@hockey/game-core';
import { PixiStage } from '../game/PixiStage.js';
import { Rink } from '../game/renderer/Rink.js';
import { Goal } from '../game/renderer/Goal.js';
import { Goalie } from '../game/renderer/Goalie.js';
import { Puck } from '../game/renderer/Puck.js';
import { createGameLoop } from '../game/loop.js';
import { createDragInput } from '../game/input/DragInput.js';
import type { Scale } from '../game/coords.js';
import { useTrainingStore } from '../stores/trainingStore.js';

export function DuelScreen(): JSX.Element {
  const { goalieId } = useParams<{ goalieId: string }>();
  const navigate = useNavigate();

  const state = useTrainingStore();
  const scaleRef = useRef<Scale>({ factor: 1, offsetX: 0, offsetY: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!goalieId) {
      setError('Не указан босс');
      return;
    }
    try {
      getGoalie(goalieId);
      useTrainingStore.getState().startDuel(goalieId);
    } catch {
      setError(`Неизвестный босс: ${goalieId}`);
    }
    return () => useTrainingStore.getState().reset();
  }, [goalieId]);

  const handleReady = (app: Application, initialScale: Scale): void => {
    scaleRef.current = initialScale;

    const rink = new Rink();
    const goal = new Goal();
    const goalie = new Goalie();
    const puck = new Puck();

    app.stage.addChild(rink.container);
    app.stage.addChild(goal.container);
    app.stage.addChild(goalie.container);
    app.stage.addChild(puck.container);

    const refresh = (s: Scale): void => {
      scaleRef.current = s;
      rink.update(s);
      goal.update(s);
      puck.resetAtStart(s);
    };
    refresh(initialScale);

    const loop = createGameLoop({
      goalieRenderer: goalie,
      puckRenderer: puck,
      getScale: () => scaleRef.current,
      getSeed: () => useTrainingStore.getState().seed,
      getShotIndex: () => useTrainingStore.getState().shotIndex,
      getGoalieId: () => useTrainingStore.getState().currentGoalieId,
    });
    loop.attach(app.ticker);

    const input = createDragInput();
    input.attach(
      app.canvas,
      () => scaleRef.current,
      (shot: ShotInput) => {
        const st = useTrainingStore.getState();
        if (!st.currentGoalieId || puck.isFlying() || st.isCleared) return;
        const cfg = getGoalie(st.currentGoalieId);
        const goalieState = simulateGoalie(
          cfg,
          st.seed,
          st.shotIndex,
          performance.now() - loop.sessionStartMs,
        );
        const tr = computeTrajectory(shot);
        const result: ShotResult = resolveShot(shot, goalieState, STICK_NEUTRAL);
        puck.playShot(tr.start, tr.end, performance.now());
        // Apply after the 300ms flight so the HUD matches the visual.
        window.setTimeout(() => {
          useTrainingStore.getState().applyResult(result);
          puck.resetAtStart(scaleRef.current);
        }, 320);
      },
    );

    // loop и input живут до тех пор, пока жив `app`. PixiStage при unmount
    // вызывает `app.destroy(true)` — ticker остановится (loop.onTick перестаёт
    // вызываться), canvas уничтожится (listeners у DragInput автоматически
    // отцепятся вместе с ним). Explicit detach в Plan 3 не нужен.
  };

  const handleResize = (s: Scale): void => {
    scaleRef.current = s;
  };

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <p style={{ color: '#c0392b' }}>{error}</p>
        <Link to="/">← На выбор босса</Link>
      </main>
    );
  }

  const cfg = state.currentGoalieId ? getGoalie(state.currentGoalieId) : null;
  const hpPct = cfg ? Math.round((state.hpLeft / cfg.hp) * 100) : 0;

  return (
    <main style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#0b2e5c' }}>
      <header style={{ padding: '12px 16px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => navigate('/')} style={{ background: 'transparent', color: 'white', border: '1px solid white', padding: '4px 12px', borderRadius: 4 }}>
          ← Назад
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, opacity: 0.8 }}>Босс</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{cfg?.name ?? '—'}</div>
        </div>
        <div style={{ fontSize: 14, textAlign: 'right' }}>
          <div>Голы: {state.sessionGoals}</div>
          <div>Промахи: {state.sessionMisses}</div>
          <div>Стрик: {state.streak}</div>
        </div>
      </header>
      <div style={{ padding: '0 16px 8px', color: 'white' }}>
        <div style={{ height: 8, background: 'rgba(255,255,255,0.15)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${hpPct}%`, background: '#ff5a5a', transition: 'width 200ms' }} />
        </div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
          HP: {state.hpLeft} / {cfg?.hp ?? '?'}
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <PixiStage onReady={handleReady} onResize={handleResize} />
        {state.isCleared && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.55)', color: 'white', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ fontSize: 32, fontWeight: 700 }}>Босс повержен!</div>
            <button onClick={() => useTrainingStore.getState().startDuel(cfg!.id)} style={{ padding: '8px 24px', fontSize: 16 }}>
              Ещё раз
            </button>
            <Link to="/" style={{ color: 'white' }}>К списку боссов</Link>
          </div>
        )}
        {state.lastResult && !state.isCleared && (
          <div key={state.shotIndex} style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            color: 'white', fontSize: 20, fontWeight: 600,
            background: 'rgba(0,0,0,0.4)', padding: '4px 12px', borderRadius: 4,
          }}>
            {state.lastResult.type === 'goal' && 'ГОЛ!'}
            {state.lastResult.type === 'save' && 'Сэйв'}
            {state.lastResult.type === 'miss' && `Мимо (${state.lastResult.reason})`}
          </div>
        )}
      </div>
    </main>
  );
}

```

- [ ] **Step 2: Smoke-тест `DuelScreen.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../game/PixiStage.js', () => ({
  PixiStage: () => <div data-testid="pixi-stage-mock" />,
}));

import { DuelScreen } from './DuelScreen.js';

describe('DuelScreen', () => {
  it('renders the goalie name in the header for a valid id', () => {
    render(
      <MemoryRouter initialEntries={['/duel/rookie']}>
        <Routes>
          <Route path="/duel/:goalieId" element={<DuelScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Новичок')).toBeInTheDocument();
    expect(screen.getByTestId('pixi-stage-mock')).toBeInTheDocument();
  });

  it('shows an error for an unknown goalie id', () => {
    render(
      <MemoryRouter initialEntries={['/duel/no-such-boss']}>
        <Routes>
          <Route path="/duel/:goalieId" element={<DuelScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/неизвестный босс/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Обновить `app/App.tsx`**

Заменить `DuelPlaceholder` на импорт из `../screens/DuelScreen.js`:

```tsx
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { DuelScreen } from '../screens/DuelScreen.js';

function HomePlaceholder(): JSX.Element {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Ultimate Hockey — Training</h1>
      <p>Выбор вратарей появится в следующей задаче.</p>
      <Link to="/duel/rookie">→ Тестовый переход на бой с Новичком</Link>
    </main>
  );
}

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePlaceholder />} />
        <Route path="/duel/:goalieId" element={<DuelScreen />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 4: Прогнать все тесты**

Run: `pnpm --filter @hockey/web test`
Expected: PASS (все новые и предыдущие тесты зелёные).

- [ ] **Step 5: Ручной smoke**

Запустить `pnpm dev:web`, открыть http://localhost:5173, кликнуть «Тестовый переход на бой с Новичком». Убедиться:
- Видно вратаря, который движется влево-вправо.
- Видно ворота с красными штангами.
- Видно чёрную шайбу внизу по центру.
- Тянешь пальцем (или мышью) от шайбы вниз → отпускаешь → шайба летит в сторону, противоположную оттяжке.
- Результат отображается вверху («ГОЛ!», «Сэйв», «Мимо»).
- HP-бар двигается при голах.
- После HP=0 показывается overlay «Босс повержен!».

- [ ] **Step 6: Коммит**

```bash
git add packages/web/src/screens/DuelScreen.tsx packages/web/src/screens/DuelScreen.test.tsx packages/web/src/app/App.tsx
git commit -m "feat(web): DuelScreen wiring — playable training against any boss"
```

---

## Task 11: `screens/GoalieListScreen.tsx` — выбор босса

**Files:**
- Create: `packages/web/src/screens/GoalieListScreen.tsx`
- Create: `packages/web/src/screens/GoalieListScreen.test.tsx`
- Modify: `packages/web/src/app/App.tsx` (заменить `HomePlaceholder`)

Список 10 боссов из `GOALIES`, карточкой: имя, паттерн (Linear/Sine/Dash/Feint → человекочитаемо), HP. Клик → navigate(`/duel/:id`).

- [ ] **Step 1: Реализация `GoalieListScreen.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { GOALIES, type GoaliePatternId } from '@hockey/game-core';

const PATTERN_LABEL: Record<GoaliePatternId, string> = {
  linear: 'Линейный',
  sine: 'Синусоида',
  dash: 'Рывки',
  feint: 'Финты',
};

export function GoalieListScreen(): JSX.Element {
  return (
    <main style={{ minHeight: '100vh', background: '#e8f1ff', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ color: '#0b2e5c', margin: '0 0 8px' }}>Ultimate Hockey</h1>
      <p style={{ color: '#4a6a8a', marginTop: 0 }}>Тренировочный режим. Выбирай босса.</p>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', marginTop: 16 }}>
        {GOALIES.map((g, idx) => (
          <Link
            key={g.id}
            to={`/duel/${g.id}`}
            style={{
              display: 'block', padding: 16, background: 'white', borderRadius: 12,
              boxShadow: '0 2px 8px rgba(11,46,92,0.08)', textDecoration: 'none', color: '#0b2e5c',
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.6 }}>#{idx + 1}</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{g.name}</div>
            <div style={{ fontSize: 13, color: '#4a6a8a', marginTop: 4 }}>
              {PATTERN_LABEL[g.pattern]} · HP {g.hp}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Тест `GoalieListScreen.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GoalieListScreen } from './GoalieListScreen.js';
import { GOALIES } from '@hockey/game-core';

describe('GoalieListScreen', () => {
  it('renders all 10 bosses with a link each', () => {
    render(
      <MemoryRouter>
        <GoalieListScreen />
      </MemoryRouter>,
    );
    for (const g of GOALIES) {
      const link = screen.getByRole('link', { name: new RegExp(g.name) });
      expect(link).toHaveAttribute('href', `/duel/${g.id}`);
    }
  });
});
```

- [ ] **Step 3: Обновить `app/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DuelScreen } from '../screens/DuelScreen.js';
import { GoalieListScreen } from '../screens/GoalieListScreen.js';

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GoalieListScreen />} />
        <Route path="/duel/:goalieId" element={<DuelScreen />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `pnpm --filter @hockey/web test`
Expected: все PASS.

- [ ] **Step 5: Коммит**

```bash
git add packages/web/src/screens/GoalieListScreen.tsx packages/web/src/screens/GoalieListScreen.test.tsx packages/web/src/app/App.tsx
git commit -m "feat(web): goalie list screen with 10 bosses"
```

---

## Task 12: Полировка, build, CI и выкладка

**Files:**
- Modify: `packages/web/src/index.html` (title, viewport)
- Modify: корневой `package.json` или CI workflow — только если что-то сломалось.

- [ ] **Step 1: Title и viewport**

В `packages/web/index.html` убедись, что есть:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<title>Ultimate Hockey — Training</title>
```

(`maximum-scale` и `user-scalable=no` — чтобы drag не конфликтовал с pinch-zoom на мобильном.)

- [ ] **Step 2: Полный прогон локально**

```bash
pnpm --filter @hockey/game-core build
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @hockey/web build
```

Expected: всё зелёное.

- [ ] **Step 3: Ручной smoke — полный путь пользователя**

```bash
pnpm dev:web
```

Открыть http://localhost:5173. Проверить:
1. Главный экран показывает 10 боссов, последовательность по порядку (Новичок → Легенда).
2. Клик на босса переносит на `/duel/:id`, видно его имя в шапке.
3. Вратарь движется (Новичок — линейно; Осьминог — синусоида; Рывок — рывками).
4. Drag от шайбы вниз → шайба летит вверх к воротам. Успех — голый и сэйв визуально отличимы.
5. HP-бар двигается на голах.
6. Feint-боссы (Финтарь, Ледяной Король, Легенда) играются (fallback в sine через `simulate.ts` из Plan 2) — это ожидаемо.
7. «Назад» и «Ещё раз» работают.
8. На десктопе (широкое окно) каток не растягивается, отцентрирован с чёрными полями по бокам.

- [ ] **Step 4: Коммит полировок (если менял `index.html`)**

```bash
git add packages/web/index.html
git commit -m "chore(web): viewport meta for training mode"
```

- [ ] **Step 5: Открыть PR**

```bash
git push -u origin HEAD
gh pr create --title "Plan 3: playable training prototype" --body "$(cat <<'EOF'
## Summary

- Клиентский playable-прототип: 10 боссов из Plan 2, drag-and-release, локальный HP и стрик.
- Без сервера, без auth, без persist. Всё в `@hockey/web`.
- Следующий план — серверная часть (auth + DB + `/duel/*`).

## Test plan

- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @hockey/web build` локально
- [ ] На staging/prod пройти все 10 боссов по разу drag'ом — убедиться что вратарь движется, шайба летит, результаты отличимы визуально
- [ ] Проверить на мобильном (Safari iOS + Chrome Android) — drag работает, нет pinch-zoom конфликта

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: После merge — проверка прода**

CI прогонит сборку, docker-build и deploy (через существующий workflow из Plan 1). Дождаться зелёного деплоя, открыть https://hockey.inbotwetrust.ru, пройти тот же smoke-путь что в Step 3.

---

## Итоговый чек-лист результата

После Task 12 merge-нут:

- [x] На проде играется тренировка против любого из 10 боссов.
- [x] `pnpm test` во всех пакетах зелёный.
- [x] `pnpm typecheck` и `pnpm lint` зелёные.
- [x] Нет ни одного `Math.random()` / `Date.now()` внутри `game-core` (этот инвариант Plan 2 не нарушен).
- [x] Web не требует сервера для запуска training режима — `/api` прокси не используется.
- [x] Файловая структура `web/src` соответствует спеке §5.1 (хотя бы для реализованного подмножества).

Дальнейшие планы:

- **Plan 4 — Auth + Server + Real duel sessions.** Эндпоинты `/duel/start`, `/duel/shot`, `/duel/end`, Postgres схема, Redis кэш. Training mode остаётся, добавляется боевой режим с попытками и наградами.
- **Plan 5 — Economy + Sticks + Rewards.** Колесо удачи, магазин, дроп клюшек, `calcShotReward` в UI.
- **Plan 6 — PWA + Sound + Polish.** Service worker, install prompt, звуковой фидбэк, три input-схемы.
