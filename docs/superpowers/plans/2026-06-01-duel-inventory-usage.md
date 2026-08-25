# Duel Inventory Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add duel-only inventory usage mechanics for sticks, skates, and nutrition with deterministic shot validation, resource consumption, and rink UI feedback.

**Architecture:** Extend the existing inventory tables with resource units and gameplay timing fields, then snapshot those item definitions when a duel participant presses `Готов`. Shared pure logic in `@hockey/game-core` computes player condition and puck-speed effects from the snapshot; server routes use it for validation and resource accounting, while the web rink uses it for button disabling and status display.

**Tech Stack:** pnpm monorepo, TypeScript strict mode, Fastify, PostgreSQL migrations, React 18, Zustand, TanStack Query, PixiJS, Vitest.

---

## File Structure

Create:

- `packages/server/db/migrations/050_duel_inventory_usage_resources.sql` - adds resource-unit/effect columns and seeds the new duel inventory catalogue.
- `packages/game-core/src/duelInventory.ts` - shared pure inventory condition and conversion logic.
- `packages/game-core/test/duelInventory.test.ts` - deterministic tests for condition/status/resource math.

Modify:

- `packages/game-core/src/index.ts` - export the duel inventory helpers.
- `packages/game-core/src/version.ts` - bump `GAME_CORE_VERSION` because effective shot speed and shot availability can change duel results.
- `packages/server/test/db/migrations.test.ts` - include migration `050` and assert seeded item catalogue/resource columns.
- `packages/server/src/routes/inventory.ts` - expose resource unit and compact resource labels to the client.
- `packages/server/src/duel/amateur/routes.ts` - snapshot resource effects on ready, validate shot availability, apply stick speed, and consume resources by shot/time/distance.
- `packages/server/test/duel/amateur.test.ts` - cover ready snapshots, stick consumption, blocked shots, and resource reports.
- `packages/web/src/api/inventory.ts` - add resource/effect fields to inventory DTO types.
- `packages/web/src/api/amateurDuel.ts` - add loadout resource/effect fields and condition/status report types.
- `packages/web/src/stores/amateurDuelStore.ts` - pass server validation errors cleanly through existing state.
- `packages/web/src/screens/DailyScreen.tsx` - update duel loadout UI and PlayView condition integration.
- `packages/web/src/screens/DailyScreen.test.tsx` - cover clickable inventory, locked loadout, disabled shot button, and statuses.
- `packages/web/src/screens/InventoryScreen.tsx` - display resource units in the shop/locker without changing the screen structure.
- `packages/web/src/screens/InventoryScreen.test.tsx` - assert new item names and resource labels.
- `packages/web/src/screens/ProfileScreen.tsx` - keep equipped inventory display compatible with new names/resource labels.
- `packages/web/src/screens/ProfileScreen.test.tsx` - update inventory fixtures and assertions.

Do not modify daily/training gameplay effects in this plan.

---

### Task 1: Database Schema And Inventory Catalogue

**Files:**

- Create: `packages/server/db/migrations/050_duel_inventory_usage_resources.sql`
- Modify: `packages/server/test/db/migrations.test.ts`

- [ ] **Step 1: Write migration assertions first**

In `packages/server/test/db/migrations.test.ts`, extend the migration test to assert the new inventory columns and catalogue. Replace the existing `inventory` assertion block with:

```ts
    const inventoryColumns = await pool.query<{ column_name: string }>(
      `select column_name
         from information_schema.columns
        where table_schema = 'public' and table_name = 'admin_inventory_items'
        order by column_name`,
    );
    expect(inventoryColumns.rows.map((row) => row.column_name)).toEqual(
      expect.arrayContaining([
        'resource_unit',
        'effect_puck_speed_points',
        'effect_stumble_interval_min_ms',
        'effect_stumble_interval_max_ms',
        'effect_stumble_duration_min_ms',
        'effect_stumble_duration_max_ms',
        'effect_nutrition_slowdown_ms',
        'effect_nutrition_stop_ms',
        'effect_fatigue_delay_ms',
        'effect_fatigue_speed_multiplier',
      ]),
    );

    const inventory = await pool.query<{
      title: string;
      item_kind: string;
      resource_unit: string;
      currency_price: number;
      charges_per_purchase: number;
      effect_puck_speed_points: number;
    }>(
      `select title, item_kind, resource_unit, currency_price, charges_per_purchase,
              effect_puck_speed_points
         from admin_inventory_items
        where deleted_at is null
          and item_kind in ('stick', 'skates', 'nutrition')
        order by item_kind, currency_price, title`,
    );
    expect(inventory.rows).toEqual([
      {
        title: 'Изотоник',
        item_kind: 'nutrition',
        resource_unit: 'energy_ms',
        currency_price: 1490,
        charges_per_purchase: 8_400_000,
        effect_puck_speed_points: 0,
      },
      {
        title: 'Энерго-заряд',
        item_kind: 'nutrition',
        resource_unit: 'energy_ms',
        currency_price: 2490,
        charges_per_purchase: 15_000_000,
        effect_puck_speed_points: 0,
      },
      {
        title: 'Энерго-комплекс',
        item_kind: 'nutrition',
        resource_unit: 'energy_ms',
        currency_price: 3490,
        charges_per_purchase: 21_600_000,
        effect_puck_speed_points: 0,
      },
      {
        title: 'Старт',
        item_kind: 'skates',
        resource_unit: 'distance',
        currency_price: 2990,
        charges_per_purchase: 1000,
        effect_puck_speed_points: 0,
      },
      {
        title: 'Ультимейт Ван 1',
        item_kind: 'stick',
        resource_unit: 'shot',
        currency_price: 1490,
        charges_per_purchase: 1300,
        effect_puck_speed_points: 10,
      },
      {
        title: 'Ультимейт Ван 2',
        item_kind: 'stick',
        resource_unit: 'shot',
        currency_price: 2490,
        charges_per_purchase: 1950,
        effect_puck_speed_points: 10,
      },
      {
        title: 'Ультимейт Ван 3',
        item_kind: 'stick',
        resource_unit: 'shot',
        currency_price: 3740,
        charges_per_purchase: 2500,
        effect_puck_speed_points: 10,
      },
    ]);
```

Add `'050_duel_inventory_usage_resources.sql'` to the expected migration list after `049_amateur_unlock_300_goals.sql`.

- [ ] **Step 2: Run migration test and verify it fails**

Run:

```bash
pnpm --filter @hockey/server exec vitest run test/db/migrations.test.ts
```

Expected: fail because migration `050_duel_inventory_usage_resources.sql` and the new columns do not exist.

- [ ] **Step 3: Add the migration**

Create `packages/server/db/migrations/050_duel_inventory_usage_resources.sql`:

```sql
alter table admin_inventory_items
  add column if not exists resource_unit text not null default 'period'
    check (resource_unit in ('period', 'shot', 'distance', 'energy_ms')),
  add column if not exists effect_puck_speed_points int not null default 0,
  add column if not exists effect_stumble_interval_min_ms int not null default 25000
    check (effect_stumble_interval_min_ms >= 0),
  add column if not exists effect_stumble_interval_max_ms int not null default 45000
    check (effect_stumble_interval_max_ms >= effect_stumble_interval_min_ms),
  add column if not exists effect_stumble_duration_min_ms int not null default 250
    check (effect_stumble_duration_min_ms >= 0),
  add column if not exists effect_stumble_duration_max_ms int not null default 400
    check (effect_stumble_duration_max_ms >= effect_stumble_duration_min_ms),
  add column if not exists effect_nutrition_slowdown_ms int not null default 2000
    check (effect_nutrition_slowdown_ms >= 0),
  add column if not exists effect_nutrition_stop_ms int not null default 5000
    check (effect_nutrition_stop_ms >= 0),
  add column if not exists effect_fatigue_delay_ms int not null default 90000
    check (effect_fatigue_delay_ms >= 0),
  add column if not exists effect_fatigue_speed_multiplier numeric(8, 4) not null default 0.88
    check (effect_fatigue_speed_multiplier > 0 and effect_fatigue_speed_multiplier <= 1);

update admin_inventory_items
   set deleted_at = coalesce(deleted_at, now()),
       updated_at = now()
 where deleted_at is null
   and item_kind in ('stick', 'skates', 'nutrition');

insert into admin_inventory_items
  (
    photo_url,
    title,
    description,
    price_rub,
    item_kind,
    rarity,
    currency_price,
    charges_per_purchase,
    duel_period_cost,
    power_score,
    resource_unit,
    effect_puck_speed_points,
    effect_puck_speed_delta,
    effect_stumble_chance,
    effect_stumble_ms,
    effect_stumble_blocks_per_period,
    effect_stumble_interval_min_ms,
    effect_stumble_interval_max_ms,
    effect_stumble_duration_min_ms,
    effect_stumble_duration_max_ms,
    effect_nutrition_slowdown_ms,
    effect_nutrition_stop_ms,
    effect_fatigue_delay_ms,
    effect_fatigue_speed_multiplier
  )
values
  (
    '/inventory/stick-bronze.webp',
    'Ультимейт Ван 1',
    'Комплект клюшек Ультимейт Ван на 1300 бросков. Ускоряет полёт шайбы.',
    0,
    'stick',
    'common',
    1490,
    1300,
    0,
    24,
    'shot',
    10,
    0.10,
    0,
    0,
    0,
    25000,
    45000,
    250,
    400,
    2000,
    5000,
    90000,
    0.88
  ),
  (
    '/inventory/stick-silver.webp',
    'Ультимейт Ван 2',
    'Комплект клюшек Ультимейт Ван на 1950 бросков. Ускоряет полёт шайбы.',
    0,
    'stick',
    'rare',
    2490,
    1950,
    0,
    24,
    'shot',
    10,
    0.10,
    0,
    0,
    0,
    25000,
    45000,
    250,
    400,
    2000,
    5000,
    90000,
    0.88
  ),
  (
    '/inventory/stick-gold.webp',
    'Ультимейт Ван 3',
    'Комплект клюшек Ультимейт Ван на 2500 бросков. Ускоряет полёт шайбы.',
    0,
    'stick',
    'legendary',
    3740,
    2500,
    0,
    24,
    'shot',
    10,
    0.10,
    0,
    0,
    0,
    25000,
    45000,
    250,
    400,
    2000,
    5000,
    90000,
    0.88
  ),
  (
    '/inventory/skates-bronze.webp',
    'Старт',
    'Коньки без спотыкания. Ресурс расходуется от пройденной дистанции.',
    0,
    'skates',
    'common',
    2990,
    1000,
    0,
    24,
    'distance',
    0,
    0,
    0,
    0,
    0,
    25000,
    45000,
    250,
    400,
    2000,
    5000,
    90000,
    0.88
  ),
  (
    '/inventory/nutrition-bronze.webp',
    'Изотоник',
    'Питание на 140 минут активной игры. Помогает держать темп.',
    0,
    'nutrition',
    'common',
    1490,
    8400000,
    0,
    12,
    'energy_ms',
    0,
    0,
    0,
    0,
    0,
    25000,
    45000,
    250,
    400,
    2000,
    5000,
    90000,
    0.88
  ),
  (
    '/inventory/nutrition-silver.webp',
    'Энерго-заряд',
    'Питание на 250 минут активной игры. Помогает держать темп.',
    0,
    'nutrition',
    'rare',
    2490,
    15000000,
    0,
    20,
    'energy_ms',
    0,
    0,
    0,
    0,
    0,
    25000,
    45000,
    250,
    400,
    2000,
    5000,
    90000,
    0.88
  ),
  (
    '/inventory/nutrition-gold.webp',
    'Энерго-комплекс',
    'Питание на 360 минут активной игры. Помогает держать темп.',
    0,
    'nutrition',
    'legendary',
    3490,
    21600000,
    0,
    30,
    'energy_ms',
    0,
    0,
    0,
    0,
    0,
    25000,
    45000,
    250,
    400,
    2000,
    5000,
    90000,
    0.88
  )
on conflict do nothing;
```

- [ ] **Step 4: Run migration test and verify it passes**

Run:

```bash
pnpm --filter @hockey/server exec vitest run test/db/migrations.test.ts
```

Expected: pass if integration env is available, or skip if local Postgres test env is not configured.

- [ ] **Step 5: Commit**

```bash
git add packages/server/db/migrations/050_duel_inventory_usage_resources.sql packages/server/test/db/migrations.test.ts
git commit -m "feat: add duel inventory resource schema"
```

---

### Task 2: Shared Deterministic Duel Inventory Logic

**Files:**

- Create: `packages/game-core/src/duelInventory.ts`
- Create: `packages/game-core/test/duelInventory.test.ts`
- Modify: `packages/game-core/src/index.ts`
- Modify: `packages/game-core/src/version.ts`

- [ ] **Step 1: Write shared game-core tests**

Create `packages/game-core/test/duelInventory.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DUEL_INVENTORY_TIMING,
  duelInventorySpeedPointsToPuckSpeedDelta,
  getDuelPlayerCondition,
  normalizeDuelInventoryResource,
  type DuelInventoryLoadoutSnapshot,
} from '../src/duelInventory.js';

function loadout(
  overrides: Partial<DuelInventoryLoadoutSnapshot> = {},
): DuelInventoryLoadoutSnapshot {
  return {
    stick: null,
    skates: null,
    nutrition: null,
    ...overrides,
  };
}

describe('duel inventory condition', () => {
  it('converts +10 speed points to +0.10 puck speed units', () => {
    expect(duelInventorySpeedPointsToPuckSpeedDelta(10)).toBe(0.1);
    expect(duelInventorySpeedPointsToPuckSpeedDelta(0)).toBe(0);
  });

  it('applies stick puck speed only while shot resource remains', () => {
    const condition = getDuelPlayerCondition({
      seed: 'match-seed',
      userId: 'user-a',
      periodNumber: 1,
      elapsedMs: 10_000,
      movementDistancePx: 0,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 1,
      currentShooterSpeed: 1,
      loadout: loadout({
        stick: {
          id: 'stick-1',
          title: 'Ультимейт Ван 1',
          resourceUnit: 'shot',
          resourceAvailable: 2,
          effectPuckSpeedPoints: 10,
          timing: DEFAULT_DUEL_INVENTORY_TIMING,
        },
      }),
    });

    expect(condition.puckSpeedDelta).toBe(0.1);
    expect(condition.canShoot).toBe(true);
    expect(condition.status).toBe('normal');
  });

  it('creates deterministic default-skate stumble windows', () => {
    const first = getDuelPlayerCondition({
      seed: 'same-seed',
      userId: 'user-a',
      periodNumber: 1,
      elapsedMs: 30_000,
      movementDistancePx: 300,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 1,
      currentShooterSpeed: 1,
      loadout: loadout(),
    });
    const second = getDuelPlayerCondition({
      seed: 'same-seed',
      userId: 'user-a',
      periodNumber: 1,
      elapsedMs: 30_000,
      movementDistancePx: 300,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 1,
      currentShooterSpeed: 1,
      loadout: loadout(),
    });

    expect(second).toEqual(first);
  });

  it('skates disable stumble while distance resource remains', () => {
    const condition = getDuelPlayerCondition({
      seed: 'match-seed',
      userId: 'user-a',
      periodNumber: 1,
      elapsedMs: 31_000,
      movementDistancePx: 572,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 1,
      currentShooterSpeed: 1,
      loadout: loadout({
        skates: {
          id: 'skates-1',
          title: 'Старт',
          resourceUnit: 'distance',
          resourceAvailable: 1000,
          effectPuckSpeedPoints: 0,
          timing: DEFAULT_DUEL_INVENTORY_TIMING,
        },
      }),
    });

    expect(condition.stumbleActive).toBe(false);
    expect(condition.canShoot).toBe(true);
  });

  it('nutrition depletion slows then fully stops the player', () => {
    const common = {
      seed: 'match-seed',
      userId: 'user-a',
      periodNumber: 1,
      movementDistancePx: 0,
      baseLaneWidthPx: 572,
      baselineShooterSpeed: 1,
      currentShooterSpeed: 1,
      loadout: loadout({
        nutrition: {
          id: 'nutrition-1',
          title: 'Изотоник',
          resourceUnit: 'energy_ms' as const,
          resourceAvailable: 10_000,
          effectPuckSpeedPoints: 0,
          timing: DEFAULT_DUEL_INVENTORY_TIMING,
        },
      }),
    };

    expect(getDuelPlayerCondition({ ...common, elapsedMs: 10_500 }).status).toBe(
      'nutrition_slowdown',
    );
    const stopped = getDuelPlayerCondition({ ...common, elapsedMs: 12_500 });
    expect(stopped.status).toBe('exhausted_stop');
    expect(stopped.canShoot).toBe(false);
  });

  it('normalizes distance and energy resource consumption', () => {
    expect(
      normalizeDuelInventoryResource({
        resourceUnit: 'distance',
        activePeriodMs: 60_000,
        movementDistancePx: 1144,
        baseLaneWidthPx: 572,
        speedPressureMultiplier: 1,
      }),
    ).toBe(2);
    expect(
      normalizeDuelInventoryResource({
        resourceUnit: 'energy_ms',
        activePeriodMs: 60_000,
        movementDistancePx: 0,
        baseLaneWidthPx: 572,
        speedPressureMultiplier: 1.25,
      }),
    ).toBe(75_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @hockey/game-core test -- test/duelInventory.test.ts
```

Expected: fail because `src/duelInventory.ts` does not exist.

- [ ] **Step 3: Add shared implementation**

Create `packages/game-core/src/duelInventory.ts`:

```ts
import { createRng } from './rng.js';

export type DuelInventoryResourceUnit = 'period' | 'shot' | 'distance' | 'energy_ms';
export type DuelPlayerConditionStatus =
  | 'normal'
  | 'stumble'
  | 'tired'
  | 'nutrition_slowdown'
  | 'exhausted_stop';

export interface DuelInventoryTiming {
  stumbleIntervalMinMs: number;
  stumbleIntervalMaxMs: number;
  stumbleDurationMinMs: number;
  stumbleDurationMaxMs: number;
  nutritionSlowdownMs: number;
  nutritionStopMs: number;
  fatigueDelayMs: number;
  fatigueSpeedMultiplier: number;
}

export interface DuelInventoryItemSnapshot {
  id: string;
  title: string;
  resourceUnit: DuelInventoryResourceUnit;
  resourceAvailable: number;
  effectPuckSpeedPoints: number;
  timing: DuelInventoryTiming;
}

export interface DuelInventoryLoadoutSnapshot {
  stick: DuelInventoryItemSnapshot | null;
  skates: DuelInventoryItemSnapshot | null;
  nutrition: DuelInventoryItemSnapshot | null;
}

export interface DuelPlayerConditionInput {
  seed: string;
  userId: string;
  periodNumber: number;
  elapsedMs: number;
  movementDistancePx: number;
  baseLaneWidthPx: number;
  baselineShooterSpeed: number;
  currentShooterSpeed: number;
  loadout: DuelInventoryLoadoutSnapshot;
}

export interface DuelPlayerCondition {
  puckSpeedDelta: number;
  shooterSpeedMultiplier: number;
  canShoot: boolean;
  status: DuelPlayerConditionStatus;
  stumbleActive: boolean;
  nutritionConsumed: number;
  skatesConsumed: number;
}

export const DEFAULT_DUEL_INVENTORY_TIMING: DuelInventoryTiming = {
  stumbleIntervalMinMs: 25_000,
  stumbleIntervalMaxMs: 45_000,
  stumbleDurationMinMs: 250,
  stumbleDurationMaxMs: 400,
  nutritionSlowdownMs: 2_000,
  nutritionStopMs: 5_000,
  fatigueDelayMs: 90_000,
  fatigueSpeedMultiplier: 0.88,
};

export function duelInventorySpeedPointsToPuckSpeedDelta(points: number): number {
  return Number((points / 100).toFixed(4));
}

export function duelSpeedPressureMultiplier(
  baselineShooterSpeed: number,
  currentShooterSpeed: number,
): number {
  if (baselineShooterSpeed <= 0) return 1;
  return Number(Math.max(1, currentShooterSpeed / baselineShooterSpeed).toFixed(4));
}

export function normalizeDuelInventoryResource(input: {
  resourceUnit: DuelInventoryResourceUnit;
  activePeriodMs: number;
  movementDistancePx: number;
  baseLaneWidthPx: number;
  speedPressureMultiplier: number;
}): number {
  if (input.resourceUnit === 'shot') return 1;
  if (input.resourceUnit === 'distance') {
    return Number((input.movementDistancePx / Math.max(1, input.baseLaneWidthPx)).toFixed(4));
  }
  if (input.resourceUnit === 'energy_ms') {
    return Math.ceil(input.activePeriodMs * Math.max(1, input.speedPressureMultiplier));
  }
  return 0;
}

function timingFor(item: DuelInventoryItemSnapshot | null): DuelInventoryTiming {
  return item?.timing ?? DEFAULT_DUEL_INVENTORY_TIMING;
}

function deterministicRange(seed: string, min: number, max: number): number {
  if (max <= min) return min;
  const rng = createRng(seed);
  return Math.round(min + rng() * (max - min));
}

function stumbleWindow(input: DuelPlayerConditionInput, timing: DuelInventoryTiming): {
  active: boolean;
} {
  const interval = deterministicRange(
    `${input.seed}:${input.userId}:${input.periodNumber}:stumble-interval`,
    timing.stumbleIntervalMinMs,
    timing.stumbleIntervalMaxMs,
  );
  const duration = deterministicRange(
    `${input.seed}:${input.userId}:${input.periodNumber}:stumble-duration`,
    timing.stumbleDurationMinMs,
    timing.stumbleDurationMaxMs,
  );
  if (interval <= 0 || duration <= 0) return { active: false };
  const cyclePosition = input.elapsedMs % interval;
  return { active: cyclePosition < duration };
}

export function getDuelPlayerCondition(input: DuelPlayerConditionInput): DuelPlayerCondition {
  const speedPressureMultiplier = duelSpeedPressureMultiplier(
    input.baselineShooterSpeed,
    input.currentShooterSpeed,
  );
  const skatesConsumed = normalizeDuelInventoryResource({
    resourceUnit: 'distance',
    activePeriodMs: input.elapsedMs,
    movementDistancePx: input.movementDistancePx,
    baseLaneWidthPx: input.baseLaneWidthPx,
    speedPressureMultiplier,
  });
  const skatesActive =
    input.loadout.skates?.resourceUnit === 'distance' &&
    input.loadout.skates.resourceAvailable > skatesConsumed;
  const nutrition = input.loadout.nutrition;
  const nutritionConsumed =
    nutrition?.resourceUnit === 'energy_ms'
      ? normalizeDuelInventoryResource({
          resourceUnit: 'energy_ms',
          activePeriodMs: input.elapsedMs,
          movementDistancePx: input.movementDistancePx,
          baseLaneWidthPx: input.baseLaneWidthPx,
          speedPressureMultiplier,
        })
      : 0;
  const nutritionRemaining =
    nutrition?.resourceUnit === 'energy_ms' && nutrition.resourceAvailable > nutritionConsumed;
  const nutritionDepletedAt =
    nutrition?.resourceUnit === 'energy_ms'
      ? Math.ceil(nutrition.resourceAvailable / speedPressureMultiplier)
      : 0;
  const nutritionTiming = timingFor(nutrition);
  const sinceNutritionDepletion =
    nutrition?.resourceUnit === 'energy_ms' ? input.elapsedMs - nutritionDepletedAt : -1;

  const stickActive =
    input.loadout.stick?.resourceUnit === 'shot' && input.loadout.stick.resourceAvailable > 0;
  const puckSpeedDelta =
    stickActive && input.loadout.stick
      ? duelInventorySpeedPointsToPuckSpeedDelta(input.loadout.stick.effectPuckSpeedPoints)
      : 0;

  if (
    sinceNutritionDepletion >= nutritionTiming.nutritionSlowdownMs &&
    sinceNutritionDepletion < nutritionTiming.nutritionSlowdownMs + nutritionTiming.nutritionStopMs
  ) {
    return {
      puckSpeedDelta,
      shooterSpeedMultiplier: 0,
      canShoot: false,
      status: 'exhausted_stop',
      stumbleActive: false,
      nutritionConsumed,
      skatesConsumed,
    };
  }
  if (sinceNutritionDepletion >= 0 && sinceNutritionDepletion < nutritionTiming.nutritionSlowdownMs) {
    return {
      puckSpeedDelta,
      shooterSpeedMultiplier: nutritionTiming.fatigueSpeedMultiplier,
      canShoot: true,
      status: 'nutrition_slowdown',
      stumbleActive: false,
      nutritionConsumed,
      skatesConsumed,
    };
  }

  const defaultSkatesTiming = timingFor(input.loadout.skates);
  const stumble = skatesActive ? { active: false } : stumbleWindow(input, defaultSkatesTiming);
  if (stumble.active) {
    return {
      puckSpeedDelta,
      shooterSpeedMultiplier: defaultSkatesTiming.fatigueSpeedMultiplier,
      canShoot: false,
      status: 'stumble',
      stumbleActive: true,
      nutritionConsumed,
      skatesConsumed,
    };
  }

  const tired =
    !nutritionRemaining && input.elapsedMs >= Math.max(0, nutritionTiming.fatigueDelayMs);
  return {
    puckSpeedDelta,
    shooterSpeedMultiplier: tired ? nutritionTiming.fatigueSpeedMultiplier : 1,
    canShoot: true,
    status: tired ? 'tired' : 'normal',
    stumbleActive: false,
    nutritionConsumed,
    skatesConsumed,
  };
}
```

- [ ] **Step 4: Export helpers and bump game-core version**

In `packages/game-core/src/index.ts`, add:

```ts
export {
  DEFAULT_DUEL_INVENTORY_TIMING,
  duelInventorySpeedPointsToPuckSpeedDelta,
  duelSpeedPressureMultiplier,
  getDuelPlayerCondition,
  normalizeDuelInventoryResource,
  type DuelInventoryItemSnapshot,
  type DuelInventoryLoadoutSnapshot,
  type DuelInventoryResourceUnit,
  type DuelInventoryTiming,
  type DuelPlayerCondition,
  type DuelPlayerConditionInput,
  type DuelPlayerConditionStatus,
} from './duelInventory.js';
```

In `packages/game-core/src/version.ts`, increment `GAME_CORE_VERSION` by `1`.

- [ ] **Step 5: Run game-core tests**

Run:

```bash
pnpm --filter @hockey/game-core test -- test/duelInventory.test.ts
pnpm --filter @hockey/game-core test
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

```bash
git add packages/game-core/src/duelInventory.ts packages/game-core/test/duelInventory.test.ts packages/game-core/src/index.ts packages/game-core/src/version.ts
git commit -m "feat: add deterministic duel inventory logic"
```

---

### Task 3: Server Inventory DTOs And Loadout Snapshots

**Files:**

- Modify: `packages/server/src/routes/inventory.ts`
- Modify: `packages/server/src/duel/amateur/routes.ts`
- Modify: `packages/server/test/duel/amateur.test.ts`

- [ ] **Step 1: Add server tests for resource-aware ready snapshots**

In `packages/server/test/duel/amateur.test.ts`, add a test near the existing inventory/loadout tests:

```ts
  it('snapshots duel inventory resource units and effects on ready', async () => {
    const stickId = await createInventoryItem('stick', 'Ультимейт Ван 1');
    await pool.query(
      `update admin_inventory_items
          set resource_unit = 'shot',
              charges_per_purchase = 1300,
              effect_puck_speed_points = 10,
              effect_puck_speed_delta = 0.10,
              duel_period_cost = 0
        where id = $1`,
      [stickId],
    );
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 1300)`,
      [userA, stickId],
    );
    await pool.query(
      `insert into user_equipment (user_id, equipped_stick_item_id)
       values ($1, $2)
       on conflict (user_id)
       do update set equipped_stick_item_id = excluded.equipped_stick_item_id`,
      [userA, stickId],
    );

    const { matchId } = await createAcceptedDuelInvite();
    const ready = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: authHeaders(userA),
      payload: { loadout: {} },
    });

    expect(ready.statusCode).toBe(200);
    const item = ready.json().match.me.loadout.items.find((cur: { id: string }) => cur.id === stickId);
    expect(item).toMatchObject({
      id: stickId,
      title: 'Ультимейт Ван 1',
      resourceUnit: 'shot',
      resourceAvailable: 1300,
      effectPuckSpeedPoints: 10,
    });
  });
```

Use existing helper names where they differ in the file. If `createAcceptedDuelInvite()` is not present, use the same invite/template creation helper already used by the nearby ready tests.

- [ ] **Step 2: Run targeted test and verify it fails**

Run:

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server exec vitest run test/duel/amateur.test.ts -t "snapshots duel inventory resource units"
```

Expected: fail because loadout items do not expose `resourceUnit`, `resourceAvailable`, or `effectPuckSpeedPoints`.

- [ ] **Step 3: Extend inventory route DTOs**

In `packages/server/src/routes/inventory.ts`:

1. Add `resource_unit`, `effect_puck_speed_points`, and timing fields to `InventoryItemRow`.
2. Add matching camelCase fields to `InventoryItemDto`.
3. Select the new columns in `fetchInventoryState`.
4. Map them into DTOs.

Use this mapping shape:

```ts
resourceUnit: row.resource_unit,
effectPuckSpeedPoints: Number(row.effect_puck_speed_points),
resourceLabel:
  row.resource_unit === 'shot'
    ? `${Number(row.charges_available)} бросков`
    : row.resource_unit === 'energy_ms'
      ? `${Math.floor(Number(row.charges_available) / 60_000)} мин`
      : row.resource_unit === 'distance'
        ? `${Number(row.charges_available)} ед.`
        : `${Number(row.charges_available)} зарядов`,
```

- [ ] **Step 4: Extend server loadout snapshot types**

In `packages/server/src/duel/amateur/routes.ts`:

1. Import shared types:

```ts
import {
  DEFAULT_DUEL_INVENTORY_TIMING,
  type DuelInventoryResourceUnit,
  type DuelInventoryTiming,
} from '@hockey/game-core';
```

2. Extend `InventoryItemEffects`:

```ts
  puckSpeedPoints: number;
  stumbleIntervalMinMs: number;
  stumbleIntervalMaxMs: number;
  stumbleDurationMinMs: number;
  stumbleDurationMaxMs: number;
  nutritionSlowdownMs: number;
  nutritionStopMs: number;
  fatigueDelayMs: number;
  fatigueSpeedMultiplier: number;
```

3. Extend `LoadoutItemSnapshot`:

```ts
  resourceUnit: DuelInventoryResourceUnit;
  resourceAvailable: number;
  effectPuckSpeedPoints: number;
  timing: DuelInventoryTiming;
```

4. Update `effectsFromUnknown()` and `loadoutFromUnknown()` schemas to parse the new fields with defaults from `DEFAULT_DUEL_INVENTORY_TIMING`.

5. In `buildLoadoutSnapshot()`, select:

```sql
i.resource_unit,
i.effect_puck_speed_points,
i.effect_stumble_interval_min_ms,
i.effect_stumble_interval_max_ms,
i.effect_stumble_duration_min_ms,
i.effect_stumble_duration_max_ms,
i.effect_nutrition_slowdown_ms,
i.effect_nutrition_stop_ms,
i.effect_fatigue_delay_ms,
i.effect_fatigue_speed_multiplier
```

6. Store:

```ts
resourceUnit: row.resource_unit,
resourceAvailable: Number(row.charges_available),
effectPuckSpeedPoints: Number(row.effect_puck_speed_points),
timing: {
  stumbleIntervalMinMs: Number(row.effect_stumble_interval_min_ms),
  stumbleIntervalMaxMs: Number(row.effect_stumble_interval_max_ms),
  stumbleDurationMinMs: Number(row.effect_stumble_duration_min_ms),
  stumbleDurationMaxMs: Number(row.effect_stumble_duration_max_ms),
  nutritionSlowdownMs: Number(row.effect_nutrition_slowdown_ms),
  nutritionStopMs: Number(row.effect_nutrition_stop_ms),
  fatigueDelayMs: Number(row.effect_fatigue_delay_ms),
  fatigueSpeedMultiplier: numberFromUnknown(row.effect_fatigue_speed_multiplier, 0.88),
},
```

- [ ] **Step 5: Run targeted server test**

Run:

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server exec vitest run test/duel/amateur.test.ts -t "snapshots duel inventory resource units"
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/routes/inventory.ts packages/server/src/duel/amateur/routes.ts packages/server/test/duel/amateur.test.ts
git commit -m "feat: snapshot duel inventory resources"
```

---

### Task 4: Server Shot Validation And Resource Consumption

**Files:**

- Modify: `packages/server/src/duel/amateur/routes.ts`
- Modify: `packages/server/test/duel/amateur.test.ts`

- [ ] **Step 1: Add tests for stick shot consumption and blocked shots**

In `packages/server/test/duel/amateur.test.ts`, add two tests near the `/shot` tests:

```ts
  it('consumes one stick shot and applies the stick speed bonus on accepted duel shot', async () => {
    const stickId = await createInventoryItem('stick', 'Ультимейт Ван 1');
    await pool.query(
      `update admin_inventory_items
          set resource_unit = 'shot',
              charges_per_purchase = 1300,
              effect_puck_speed_points = 10,
              effect_puck_speed_delta = 0.10,
              duel_period_cost = 0
        where id = $1`,
      [stickId],
    );
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 2)`,
      [userA, stickId],
    );
    const { matchId } = await createReadyActiveDuel({ userALoadout: { stick: stickId } });
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/period/start`,
      headers: authHeaders(userA),
    });
    const shot = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: authHeaders(userA),
      payload: {
        shot_index: 1,
        input: { tapTime: 1000, shooterTapTime: 1000, puckSpeedPerMs: 1.3, shooterFrequency: 1 },
        claimed_result: 'miss',
      },
    });

    expect(shot.statusCode).toBe(200);
    const remaining = await pool.query<{ charges_available: number }>(
      `select charges_available
         from user_inventory_item
        where user_id = $1 and inventory_item_id = $2`,
      [userA, stickId],
    );
    expect(Number(remaining.rows[0]?.charges_available)).toBe(1);
  });

  it('rejects duel shots during deterministic exhausted stop', async () => {
    const nutritionId = await createInventoryItem('nutrition', 'Изотоник');
    await pool.query(
      `update admin_inventory_items
          set resource_unit = 'energy_ms',
              charges_per_purchase = 1000,
              effect_nutrition_slowdown_ms = 2000,
              effect_nutrition_stop_ms = 5000,
              duel_period_cost = 0
        where id = $1`,
      [nutritionId],
    );
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 1000)`,
      [userA, nutritionId],
    );
    const { matchId } = await createReadyActiveDuel({ userALoadout: { nutrition: nutritionId } });
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/period/start`,
      headers: authHeaders(userA),
    });
    const shot = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: authHeaders(userA),
      payload: {
        shot_index: 1,
        input: { tapTime: 3500, shooterTapTime: 3500, puckSpeedPerMs: 1.2, shooterFrequency: 1 },
        claimed_result: 'miss',
      },
    });

    expect(shot.statusCode).toBe(409);
    expect(shot.json().error.message).toContain('player cannot shoot');
  });
```

Adapt helper names to existing helpers in the file. Keep the assertions equivalent.

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server exec vitest run test/duel/amateur.test.ts -t "stick shot|exhausted stop"
```

Expected: fail because shots are not yet resource-consumed or condition-validated.

- [ ] **Step 3: Add loadout conversion helpers in server route**

In `packages/server/src/duel/amateur/routes.ts`, import:

```ts
import {
  getDuelPlayerCondition,
  normalizeDuelInventoryResource,
  type DuelInventoryLoadoutSnapshot,
} from '@hockey/game-core';
```

Add helpers near `loadoutFromUnknown()`:

```ts
function conditionLoadoutFromSnapshot(loadout: LoadoutSnapshot): DuelInventoryLoadoutSnapshot {
  const itemFor = (kind: InventoryKind) => {
    const item = loadout.items.find((cur) => cur.kind === kind);
    if (!item) return null;
    return {
      id: item.id,
      title: item.title,
      resourceUnit: item.resourceUnit,
      resourceAvailable: item.resourceAvailable,
      effectPuckSpeedPoints: item.effectPuckSpeedPoints,
      timing: item.timing,
    };
  };
  return {
    stick: itemFor('stick'),
    skates: itemFor('skates'),
    nutrition: itemFor('nutrition'),
  };
}

function currentMovementDistancePx(elapsedMs: number, shooterFrequency: number): number {
  return Math.max(0, elapsedMs * Math.max(0.1, shooterFrequency) * 0.12);
}
```

- [ ] **Step 4: Validate shot condition and apply stick speed**

In the amateur duel `/shot` handler, before `resolveShot(...)`:

1. Parse participant loadout.
2. Calculate elapsed period ms from `participant.period_started_at`.
3. Build condition using `getDuelPlayerCondition`.
4. Reject if `condition.canShoot` is false.
5. Require effective `puckSpeedPerMs` to match the condition-adjusted preset speed.

Use this shape:

```ts
const loadout = loadoutFromUnknown(participant.loadout_snapshot, rules.powerCap);
const periodElapsedMs = Math.max(0, now.getTime() - participant.period_started_at.getTime());
const preset = getPeriodSpeedPreset(rules, participant.current_period);
const condition = getDuelPlayerCondition({
  seed: match.match_seed,
  userId: req.user.id,
  periodNumber: participant.current_period,
  elapsedMs: periodElapsedMs,
  movementDistancePx: currentMovementDistancePx(periodElapsedMs, preset.shooterFrequency),
  baseLaneWidthPx: 572,
  baselineShooterSpeed: 1,
  currentShooterSpeed: preset.shooterFrequency,
  loadout: conditionLoadoutFromSnapshot(loadout),
});
if (!condition.canShoot) {
  throw new AppError('conflict', `player cannot shoot: ${condition.status}`, 409);
}
const expectedPuckSpeed = clampSpeed(preset.puckSpeedPerMs + condition.puckSpeedDelta, 0.2, 5);
if (Math.abs(Number(body.data.input.puckSpeedPerMs ?? 0) - expectedPuckSpeed) > 0.0001) {
  throw new AppError('conflict', 'invalid puck speed for duel inventory state', 409);
}
```

Keep existing server-side `resolveShot` logic, but pass the expected speed through the input used for resolution.

- [ ] **Step 5: Consume resources as gameplay is recorded**

Add a helper near `consumeInventoryForPeriod()`:

```ts
async function consumeInventoryForShot(
  client: PoolClient,
  participant: DuelParticipantRow,
  loadout: LoadoutSnapshot,
  opts: {
    activePeriodMs: number;
    movementDistancePx: number;
    baseLaneWidthPx: number;
    speedPressureMultiplier: number;
  },
): Promise<void> {
  const consumed: InventoryPeriodReport['consumed'] = [];
  for (const item of loadout.items) {
    const charges =
      item.resourceUnit === 'shot'
        ? 1
        : normalizeDuelInventoryResource({
            resourceUnit: item.resourceUnit,
            activePeriodMs: opts.activePeriodMs,
            movementDistancePx: opts.movementDistancePx,
            baseLaneWidthPx: opts.baseLaneWidthPx,
            speedPressureMultiplier: opts.speedPressureMultiplier,
          });
    if (charges <= 0) continue;
    await client.query(
      `update user_inventory_item
          set charges_available = greatest(0, charges_available - $3),
              updated_at = now()
        where user_id = $1 and inventory_item_id = $2`,
      [participant.user_id, item.id, Math.ceil(charges)],
    );
    consumed.push({
      id: item.id,
      kind: item.kind,
      title: item.title,
      charges: Math.ceil(charges),
      remainingReserved: 0,
    });
  }
  if (consumed.length === 0) return;
  const periodReport: InventoryPeriodReport = {
    periodNumber: participant.current_period,
    consumed,
  };
  const report = [...inventoryReportFromUnknown(participant.inventory_report), periodReport];
  const consumedCharges = consumed.reduce((sum, item) => sum + item.charges, 0);
  await client.query(
    `update amateur_duel_participant
        set consumed_inventory_charges = consumed_inventory_charges + $3,
            inventory_report = $4,
            updated_at = now()
      where match_id = $1 and user_id = $2`,
    [participant.match_id, participant.user_id, consumedCharges, JSON.stringify(report)],
  );
}
```

Call this helper after the shot is accepted and inserted. For `shot` resources this consumes one charge per accepted shot. For `distance` and `energy_ms`, consume the period-to-date resource in the first implementation only if the report has no entry for the current period; otherwise consume the delta between current estimate and prior report total for that item. Store the per-period report entries so repeated shots do not double-charge previous distance/time.

- [ ] **Step 6: Stop period-start period-cost consumption for new resource units**

In `consumeInventoryForPeriod()`, keep existing behavior only for legacy `resourceUnit === 'period'`. Skip `shot`, `distance`, and `energy_ms` items there:

```ts
if (item.resourceUnit !== 'period') continue;
```

- [ ] **Step 7: Run targeted server tests**

Run:

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server exec vitest run test/duel/amateur.test.ts -t "stick shot|exhausted stop|inventory"
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/duel/amateur/routes.ts packages/server/test/duel/amateur.test.ts
git commit -m "feat: validate duel inventory effects"
```

---

### Task 5: Web API Types And Inventory Resource Labels

**Files:**

- Modify: `packages/web/src/api/inventory.ts`
- Modify: `packages/web/src/api/amateurDuel.ts`
- Modify: `packages/web/src/screens/InventoryScreen.tsx`
- Modify: `packages/web/src/screens/ProfileScreen.tsx`
- Modify: `packages/web/src/screens/InventoryScreen.test.tsx`
- Modify: `packages/web/src/screens/ProfileScreen.test.tsx`

- [ ] **Step 1: Add web type fields**

In `packages/web/src/api/inventory.ts`, extend `InventoryItem`:

```ts
export type InventoryResourceUnit = 'period' | 'shot' | 'distance' | 'energy_ms';

export interface InventoryItem {
  id: string;
  kind: InventoryEquipmentKind;
  title: string;
  description: string;
  imageUrl: string | null;
  currencyPrice: number;
  chargesPerPurchase: number;
  rarity: InventoryRarity;
  powerScore: number;
  duelPeriodCost: number;
  chargesAvailable: number;
  chargesReserved: number;
  resourceUnit: InventoryResourceUnit;
  resourceLabel: string;
  effectPuckSpeedPoints: number;
}
```

In `packages/web/src/api/amateurDuel.ts`, extend `AmateurDuelLoadoutItem` and `AmateurDuelInventoryAvailabilityItem` with:

```ts
resourceUnit: InventoryResourceUnit;
resourceAvailable: number;
resourceLabel?: string;
effectPuckSpeedPoints: number;
```

Import `InventoryResourceUnit` from `./inventory.js`.

- [ ] **Step 2: Update UI fixtures first**

In `packages/web/src/screens/InventoryScreen.test.tsx` and `packages/web/src/screens/ProfileScreen.test.tsx`, add fields to fixture items:

```ts
resourceUnit: 'shot',
resourceLabel: '1300 бросков',
effectPuckSpeedPoints: 10,
```

For skates use:

```ts
resourceUnit: 'distance',
resourceLabel: '1000 ед.',
effectPuckSpeedPoints: 0,
```

For nutrition use:

```ts
resourceUnit: 'energy_ms',
resourceLabel: '140 мин',
effectPuckSpeedPoints: 0,
```

- [ ] **Step 3: Show resource labels in inventory cards**

In `packages/web/src/screens/InventoryScreen.tsx`, use the server `resourceLabel` next to the existing charges display. The compact display should read:

```tsx
<span>{item.resourceLabel}</span>
```

For sticks with a speed bonus, show:

```tsx
{item.effectPuckSpeedPoints > 0 && <span>+{item.effectPuckSpeedPoints} скорость шайбы</span>}
```

Keep current card layout and button styles.

- [ ] **Step 4: Keep profile equipped inventory compatible**

In `packages/web/src/screens/ProfileScreen.tsx`, where equipped item metadata is rendered, prefer `item.resourceLabel` over old charge text:

```tsx
<span>{item.resourceLabel}</span>
```

- [ ] **Step 5: Run web typecheck and focused tests**

Run:

```bash
pnpm --filter @hockey/web typecheck
pnpm --filter @hockey/web exec vitest run src/screens/InventoryScreen.test.tsx src/screens/ProfileScreen.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/api/inventory.ts packages/web/src/api/amateurDuel.ts packages/web/src/screens/InventoryScreen.tsx packages/web/src/screens/ProfileScreen.tsx packages/web/src/screens/InventoryScreen.test.tsx packages/web/src/screens/ProfileScreen.test.tsx
git commit -m "feat: show duel inventory resources"
```

---

### Task 6: Duel Rink Condition UI And Shot Button Blocking

**Files:**

- Modify: `packages/web/src/screens/DailyScreen.tsx`
- Modify: `packages/web/src/screens/DailyScreen.test.tsx`

- [ ] **Step 1: Add UI tests for locked loadout and disabled shot**

In `packages/web/src/screens/DailyScreen.test.tsx`, add tests near existing duel rink tests:

```ts
  it('keeps duel inventory icons round and locks them after ready', async () => {
    renderDailyWithDuel({
      match: {
        ...readyCheckDuelMatch,
        me: {
          ...readyCheckDuelMatch.me,
          state: 'ready',
          loadout: {
            ...readyCheckDuelMatch.me.loadout,
            items: [
              {
                id: 'stick-1',
                kind: 'stick',
                title: 'Ультимейт Ван 1',
                rarity: 'common',
                powerScore: 24,
                duelPeriodCost: 0,
                chargesReserved: 0,
                resourceUnit: 'shot',
                resourceAvailable: 1300,
                resourceLabel: '1300 бросков',
                effectPuckSpeedPoints: 10,
              },
            ],
          },
        },
      },
      route: '/?view=amateur&match=match-1&play=1',
    });

    const stickButton = await screen.findByRole('button', { name: /Ультимейт Ван 1/i });
    expect(stickButton).toBeDisabled();
    expect(stickButton.className).toContain('duel-rink-loadout');
  });

  it('disables shot button and shows status when duel inventory condition blocks shooting', async () => {
    renderDailyWithDuel({
      match: exhaustedStopDuelMatchFixture(),
      route: '/?view=amateur&match=match-1&play=1',
    });

    expect(await screen.findByText('Выдохся')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'БРОСОК' })).toBeDisabled();
  });
```

Use existing render helper names in the file. Add `exhaustedStopDuelMatchFixture()` beside nearby duel fixtures.

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm --filter @hockey/web exec vitest run src/screens/DailyScreen.test.tsx -t "duel inventory|Выдохся"
```

Expected: fail because condition UI is not wired.

- [ ] **Step 3: Build condition props in duel play screen**

In `packages/web/src/screens/DailyScreen.tsx`, import:

```ts
import { getDuelPlayerCondition, type DuelInventoryLoadoutSnapshot } from '@hockey/game-core';
```

Add a helper near duel loadout helpers:

```ts
function duelConditionLoadout(match: AmateurDuelMatchState): DuelInventoryLoadoutSnapshot {
  const fromKind = (kind: 'stick' | 'skates' | 'nutrition') => {
    const item = match.me.loadout.items.find((cur) => cur.kind === kind);
    if (!item) return null;
    return {
      id: item.id,
      title: item.title,
      resourceUnit: item.resourceUnit,
      resourceAvailable: item.resourceAvailable,
      effectPuckSpeedPoints: item.effectPuckSpeedPoints,
      timing: item.timing ?? DEFAULT_DUEL_INVENTORY_TIMING,
    };
  };
  return {
    stick: fromKind('stick'),
    skates: fromKind('skates'),
    nutrition: fromKind('nutrition'),
  };
}

function duelConditionLabel(status: string): string | null {
  if (status === 'stumble') return 'Споткнулся';
  if (status === 'tired') return 'Усталость';
  if (status === 'nutrition_slowdown') return 'Энергия заканчивается';
  if (status === 'exhausted_stop') return 'Выдохся';
  return null;
}
```

In active duel rendering, compute:

```ts
const periodElapsedMs = Math.max(0, duelMatchNowMs(match, now) - new Date(match.me.period_started_at ?? match.server_now).getTime());
const activePreset = currentDuelSpeedPreset(match);
const duelCondition = getDuelPlayerCondition({
  seed: match.match_seed ?? match.id,
  userId: match.me.user_id,
  periodNumber: match.me.current_period,
  elapsedMs: periodElapsedMs,
  movementDistancePx: periodElapsedMs * Math.max(0.1, activePreset.shooterFrequency) * 0.12,
  baseLaneWidthPx: 572,
  baselineShooterSpeed: 1,
  currentShooterSpeed: activePreset.shooterFrequency,
  loadout: duelConditionLoadout(match),
});
```

- [ ] **Step 4: Pass disabled/status props to `PlayView`**

Extend `PlayView` props in `DailyScreen.tsx`:

```ts
shotButtonDisabled?: boolean | undefined;
scoreboardNotice?: string | null | undefined;
```

In primary disabled calculation, add:

```ts
shotButtonDisabled ||
```

Pass from active duel:

```tsx
shotButtonDisabled={!duelCondition.canShoot}
scoreboardNotice={duelConditionLabel(duelCondition.status)}
```

Ensure the existing `TrainingCubeScoreboard` `notice` prop receives `scoreboardNotice`.

- [ ] **Step 5: Keep loadout icons round and clickable only before ready**

In `DuelRinkLoadoutHud` and `DuelRinkLoadoutModal` inside `DailyScreen.tsx`:

- keep the existing circular icon button shape;
- use `disabled={locked || !itemAvailable}`;
- render `resourceLabel` below the item title;
- never stretch icon art width/height away from the existing circular dimensions.

Use this button style for slot buttons:

```tsx
style={{
  width: 44,
  height: 44,
  borderRadius: '50%',
  padding: 0,
  overflow: 'hidden',
}}
```

- [ ] **Step 6: Run focused web tests**

Run:

```bash
pnpm --filter @hockey/web exec vitest run src/screens/DailyScreen.test.tsx -t "duel inventory|Выдохся|ready rink"
pnpm --filter @hockey/web typecheck
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/screens/DailyScreen.tsx packages/web/src/screens/DailyScreen.test.tsx
git commit -m "feat: apply duel inventory condition in rink"
```

---

### Task 7: Full Verification And Regression Pass

**Files:**

- Verify all touched files from Tasks 1-6.

- [ ] **Step 1: Run package checks**

Run:

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/game-core test
pnpm --filter @hockey/server typecheck
pnpm --filter @hockey/server exec vitest run test/duel/amateur.test.ts
pnpm --filter @hockey/web typecheck
pnpm --filter @hockey/web exec vitest run src/screens/DailyScreen.test.tsx src/screens/InventoryScreen.test.tsx src/screens/ProfileScreen.test.tsx
```

Expected: all pass. If DB integration env is missing, note skipped integration tests explicitly in the final handoff.

- [ ] **Step 2: Run lint if prior commands pass**

Run:

```bash
pnpm lint
```

Expected: pass.

- [ ] **Step 3: Start local preview for manual duel UI check**

Run the app if it is not already running:

```bash
pnpm dev:web
```

Open the current local app URL and verify:

- duel loadout icons are round;
- unavailable items are gray/non-clickable;
- ready locks the icons;
- active duel shot button is disabled during `Выдохся`;
- daily and training do not show inventory effects.

- [ ] **Step 4: Final commit if verification required fixes**

If Step 1 or Step 2 required small fixes, commit them:

```bash
git add packages
git commit -m "test: verify duel inventory usage"
```

No deployment is part of this plan. Deploy only after the user explicitly asks.

---

## Self-Review

- Spec coverage: sticks, skates, nutrition, admin parameters, ready snapshot, deterministic condition, shot validation, resource consumption, UI statuses, and duel-only scope are covered by Tasks 1-6.
- Specificity scan: each task names concrete files, commands, and expected outcomes.
- Type consistency: resource units are consistently `period | shot | distance | energy_ms`; shared condition status values match the spec; `+10` puck speed points consistently maps to `+0.10` `puckSpeedPerMs`.
