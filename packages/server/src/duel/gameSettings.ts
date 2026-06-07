import type { Pool, PoolClient } from 'pg';
import {
  DAILY_PERIOD_SPEED_PRESETS,
  DEFAULT_DUEL_INVENTORY_TIMING,
  GOALIES,
  getDailyPeriodSpeedPreset,
  type DailyPeriodSpeedPreset,
  type DuelInventoryTiming,
} from '@hockey/game-core';
import {
  BREAK_DURATION_MS,
  DEFAULT_DAILY_RULES,
  PERIOD_DURATION_MS,
  SHOTS_PER_PERIOD,
  TOTAL_PERIODS,
  type DailyRules,
} from './daily/reconcile.js';

type Queryable = Pool | PoolClient;

export type GameSettingValue = string | number | boolean;
export type GameSettingType = 'number' | 'select';

export interface GameSettingDefinition {
  key: string;
  label: string;
  description: string;
  type: GameSettingType;
  defaultValue: GameSettingValue;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
}

export interface GameSettingDTO extends GameSettingDefinition {
  value: GameSettingValue;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface GameSettings {
  daily: DailyRules & {
    goalieId: string;
    periodSpeedPresets: DailyPeriodSpeedPreset[];
  };
  training: {
    goalieId: string;
    shotsLimit: number;
    dailyCooldownMinutes: number;
  };
  amateur: {
    unlockGoalsRequired: number;
    noInventoryTiming: {
      skates: DuelInventoryTiming;
      nutrition: DuelInventoryTiming;
    };
  };
}

const goalieOptions = GOALIES.map((goalie) => ({ value: goalie.id, label: goalie.name }));
const goalieIds = new Set(GOALIES.map((goalie) => goalie.id));

type DailySpeedField = keyof Omit<DailyPeriodSpeedPreset, 'periodNumber'>;

const dailySpeedFields: Array<{
  field: DailySpeedField;
  key: string;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
}> = [
  {
    field: 'goalFrequency',
    key: 'goal_frequency',
    label: 'Скорость ворот',
    description: 'Частота движения ворот в этом периоде, циклов в секунду.',
    min: 0.1,
    max: 3,
    step: 0.01,
  },
  {
    field: 'goalieFrequency',
    key: 'goalie_frequency',
    label: 'Скорость вратаря',
    description: 'Частота движения вратаря в этом периоде, циклов в секунду.',
    min: 0.1,
    max: 3,
    step: 0.01,
  },
  {
    field: 'shooterFrequency',
    key: 'shooter_frequency',
    label: 'Скорость игрока',
    description: 'Частота движения игрока в этом периоде, циклов в секунду.',
    min: 0.1,
    max: 3,
    step: 0.01,
  },
  {
    field: 'puckSpeedPerMs',
    key: 'puck_speed_per_ms',
    label: 'Скорость шайбы',
    description: 'Скорость полёта шайбы в этом периоде, единиц в миллисекунду.',
    min: 0.2,
    max: 5,
    step: 0.01,
  },
];

function dailySpeedSettingKey(periodNumber: DailyPeriodSpeedPreset['periodNumber'], key: string) {
  return `daily.period_${periodNumber}.${key}`;
}

const dailyPeriodSpeedDefinitions: GameSettingDefinition[] = DAILY_PERIOD_SPEED_PRESETS.flatMap(
  (preset) =>
    dailySpeedFields.map((field) => ({
      key: dailySpeedSettingKey(preset.periodNumber, field.key),
      label: field.label,
      description: field.description,
      type: 'number' as const,
      defaultValue: preset[field.field],
      min: field.min,
      max: field.max,
      step: field.step,
    })),
);

type TimingField = keyof DuelInventoryTiming;

const noInventorySkatesFields: Array<{
  field: TimingField;
  key: string;
  label: string;
  description: string;
  min: number;
  max: number;
  step?: number;
}> = [
  {
    field: 'stumbleIntervalMinRolls',
    key: 'stumble_interval_min_rolls',
    label: 'Спотыкание: минимум прокатов',
    description:
      'Минимальное число прокатов от борта до борта до следующего спотыкания, если игрок вышел без коньков.',
    min: 1,
    max: 1000,
  },
  {
    field: 'stumbleIntervalMaxRolls',
    key: 'stumble_interval_max_rolls',
    label: 'Спотыкание: максимум прокатов',
    description:
      'Максимальное число прокатов от борта до борта до следующего спотыкания, если игрок вышел без коньков.',
    min: 1,
    max: 1000,
  },
  {
    field: 'stumbleIntervalMinMs',
    key: 'stumble_interval_min_ms',
    label: 'Спотыкание: минимум мс',
    description:
      'Минимальный интервал до спотыкания в миллисекундах. Используется, если интервалы в прокатах выставлены в 0.',
    min: 0,
    max: 600_000,
  },
  {
    field: 'stumbleIntervalMaxMs',
    key: 'stumble_interval_max_ms',
    label: 'Спотыкание: максимум мс',
    description:
      'Максимальный интервал до спотыкания в миллисекундах. Используется, если интервалы в прокатах выставлены в 0.',
    min: 0,
    max: 600_000,
  },
  {
    field: 'stumbleDurationMinMs',
    key: 'stumble_duration_min_ms',
    label: 'Спотыкание: минимум длительности',
    description:
      'Минимальная длительность состояния «споткнулся» в миллисекундах, когда игрок вышел без коньков.',
    min: 0,
    max: 30_000,
  },
  {
    field: 'stumbleDurationMaxMs',
    key: 'stumble_duration_max_ms',
    label: 'Спотыкание: максимум длительности',
    description:
      'Максимальная длительность состояния «споткнулся» в миллисекундах, когда игрок вышел без коньков.',
    min: 0,
    max: 30_000,
  },
  {
    field: 'stumbleRecoveryMinMs',
    key: 'stumble_recovery_min_ms',
    label: 'Спотыкание: минимум возврата',
    description:
      'Минимальное время возврата после спотыкания в миллисекундах. В это время бросок еще заблокирован.',
    min: 0,
    max: 30_000,
  },
  {
    field: 'stumbleRecoveryMaxMs',
    key: 'stumble_recovery_max_ms',
    label: 'Спотыкание: максимум возврата',
    description:
      'Максимальное время возврата после спотыкания в миллисекундах. В это время бросок еще заблокирован.',
    min: 0,
    max: 30_000,
  },
  {
    field: 'stumbleOffsetMinPx',
    key: 'stumble_offset_min_px',
    label: 'Спотыкание: минимальный сдвиг',
    description:
      'Минимальный сдвиг позиции игрока в пикселях для механики спотыкания без коньков.',
    min: 0,
    max: 300,
  },
  {
    field: 'stumbleOffsetMaxPx',
    key: 'stumble_offset_max_px',
    label: 'Спотыкание: максимальный сдвиг',
    description:
      'Максимальный сдвиг позиции игрока в пикселях для механики спотыкания без коньков.',
    min: 0,
    max: 300,
  },
];

const noInventoryNutritionFields: Array<{
  field: TimingField;
  key: string;
  label: string;
  description: string;
  min: number;
  max: number;
  step?: number;
}> = [
  {
    field: 'energyBaselineSpeed',
    key: 'energy_baseline_speed',
    label: 'Энергия: базовая скорость',
    description:
      'Скорость игрока, при которой энергия без питания тратится в реальном времени. Более высокая скорость ускоряет усталость.',
    min: 0.1,
    max: 3,
    step: 0.01,
  },
  {
    field: 'fatigueGraceMs',
    key: 'fatigue_grace_ms',
    label: 'Усталость: безопасное время',
    description:
      'Сколько миллисекунд игрок без питания может кататься без штрафа до начала усталости.',
    min: 0,
    max: 600_000,
  },
  {
    field: 'fatigueSlowdownStartMs',
    key: 'fatigue_slowdown_start_ms',
    label: 'Усталость: начало замедления',
    description:
      'Через сколько миллисекунд накопленной усталости игрок без питания начинает замедляться.',
    min: 0,
    max: 600_000,
  },
  {
    field: 'fatigueStopStartMs',
    key: 'fatigue_stop_start_ms',
    label: 'Усталость: начало отдыха',
    description:
      'Через сколько миллисекунд накопленной усталости игрок без питания останавливается на отдых.',
    min: 0,
    max: 600_000,
  },
  {
    field: 'fatigueStopDurationMs',
    key: 'fatigue_stop_duration_ms',
    label: 'Отдых: длительность',
    description:
      'Сколько миллисекунд игрок без питания стоит и не может бросать во время отдыха.',
    min: 0,
    max: 120_000,
  },
  {
    field: 'fatigueAfterRestMs',
    key: 'fatigue_after_rest_ms',
    label: 'Отдых: восстановление',
    description:
      'Сколько миллисекунд после отдыха игрок без питания снова едет нормально до новой усталости.',
    min: 0,
    max: 600_000,
  },
  {
    field: 'fatigueSlowMultiplier',
    key: 'fatigue_slow_multiplier',
    label: 'Усталость: множитель скорости',
    description:
      'Во сколько раз уменьшается скорость игрока без питания во время усталости. 1 — без замедления, 0.5 — вдвое медленнее.',
    min: 0,
    max: 1,
    step: 0.01,
  },
];

const noInventorySkatesDefinitions: GameSettingDefinition[] = noInventorySkatesFields.map(
  (field) => ({
    key: `amateur.no_inventory.skates.${field.key}`,
    label: field.label,
    description: field.description,
    type: 'number' as const,
    defaultValue: DEFAULT_DUEL_INVENTORY_TIMING[field.field],
    min: field.min,
    max: field.max,
    ...(field.step === undefined ? {} : { step: field.step }),
  }),
);

const noInventoryNutritionDefinitions: GameSettingDefinition[] = noInventoryNutritionFields.map(
  (field) => ({
    key: `amateur.no_inventory.nutrition.${field.key}`,
    label: field.label,
    description: field.description,
    type: 'number' as const,
    defaultValue: DEFAULT_DUEL_INVENTORY_TIMING[field.field],
    min: field.min,
    max: field.max,
    ...(field.step === undefined ? {} : { step: field.step }),
  }),
);

export const GAME_SETTING_DEFINITIONS: readonly GameSettingDefinition[] = [
  {
    key: 'daily.shots_per_period',
    label: 'Бросков в периоде',
    description: 'Квота бросков в одном периоде дневной игры.',
    type: 'number',
    defaultValue: SHOTS_PER_PERIOD,
    min: 1,
    max: 100,
  },
  {
    key: 'daily.period_duration_minutes',
    label: 'Длительность периода',
    description: 'Сколько минут длится активный период дневной игры.',
    type: 'number',
    defaultValue: PERIOD_DURATION_MS / 60000,
    min: 1,
    max: 180,
  },
  {
    key: 'daily.break_duration_minutes',
    label: 'Длительность перерыва',
    description: 'Сколько минут длится перерыв между периодами.',
    type: 'number',
    defaultValue: BREAK_DURATION_MS / 60000,
    min: 0,
    max: 180,
  },
  {
    key: 'daily.goalie_id',
    label: 'Вратарь дневной игры',
    description: 'Вратарь, против которого играется дневной режим.',
    type: 'select',
    defaultValue: 'rookie',
    options: goalieOptions,
  },
  ...dailyPeriodSpeedDefinitions,
  {
    key: 'training.shots_limit',
    label: 'Лимит тренировки',
    description: 'Сколько бросков доступно в ежедневной тренировке.',
    type: 'number',
    defaultValue: 500,
    min: 1,
    max: 1000,
  },
  {
    key: 'training.daily_cooldown_minutes',
    label: 'Блокировка дневной игры',
    description: 'Сколько минут дневная игра закрыта после первого броска в тренировке.',
    type: 'number',
    defaultValue: 30,
    min: 0,
    max: 1440,
  },
  {
    key: 'training.goalie_id',
    label: 'Вратарь тренировки',
    description: 'Вратарь, против которого играется тренировка.',
    type: 'select',
    defaultValue: 'rookie',
    options: goalieOptions,
  },
  {
    key: 'amateur.unlock_goals_required',
    label: 'Голов для любителей',
    description: 'Сколько шайб нужно забить, чтобы открыть любительскую лигу.',
    type: 'number',
    defaultValue: 300,
    min: 0,
    max: 1_000_000,
  },
  ...noInventorySkatesDefinitions,
  ...noInventoryNutritionDefinitions,
];

const definitionsByKey = new Map(
  GAME_SETTING_DEFINITIONS.map((definition) => [definition.key, definition]),
);

interface SettingRow {
  key: string;
  value: unknown;
  updated_at: Date | null;
  updated_by: string | null;
}

function numberValue(value: unknown, definition: GameSettingDefinition): number {
  const raw = typeof value === 'number' ? value : Number(value);
  const fallback = Number(definition.defaultValue);
  const min = definition.min ?? Number.NEGATIVE_INFINITY;
  const max = definition.max ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(raw)) return fallback;
  const bounded = Math.min(max, Math.max(min, raw));
  if (definition.step !== undefined && definition.step < 1) {
    return Number(bounded.toFixed(4));
  }
  return Math.trunc(bounded);
}

function selectValue(value: unknown, definition: GameSettingDefinition): string {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  const allowed = definition.options?.some((option) => option.value === raw) ?? false;
  return allowed ? raw : String(definition.defaultValue);
}

function normalizeValue(value: unknown, definition: GameSettingDefinition): GameSettingValue {
  if (definition.type === 'number') return numberValue(value, definition);
  return selectValue(value, definition);
}

export function validateGameSettingValue(
  key: string,
  value: unknown,
): { definition: GameSettingDefinition; value: GameSettingValue } {
  const definition = definitionsByKey.get(key);
  if (!definition) {
    throw new Error(`Unknown game setting: ${key}`);
  }
  const normalized = normalizeValue(value, definition);
  if (definition.type === 'select' && !goalieIds.has(String(normalized))) {
    throw new Error(`Invalid option for game setting: ${key}`);
  }
  return { definition, value: normalized };
}

export async function listGameSettings(pool: Queryable): Promise<GameSettingDTO[]> {
  const keys = GAME_SETTING_DEFINITIONS.map((definition) => definition.key);
  const { rows } = await pool.query<SettingRow>(
    `select key, value, updated_at, updated_by
       from game_settings
      where key = any($1::text[])`,
    [keys],
  );
  const rowsByKey = new Map(rows.map((row) => [row.key, row]));
  return GAME_SETTING_DEFINITIONS.map((definition) => {
    const row = rowsByKey.get(definition.key);
    return {
      ...definition,
      value: normalizeValue(row?.value ?? definition.defaultValue, definition),
      updatedAt: row?.updated_at?.toISOString() ?? null,
      updatedBy: row?.updated_by ?? null,
    };
  });
}

export async function getGameSettings(pool: Queryable): Promise<GameSettings> {
  const settings = await listGameSettings(pool);
  const values = new Map(settings.map((setting) => [setting.key, setting.value]));

  const dailyShotsPerPeriod = Number(values.get('daily.shots_per_period'));
  const dailyPeriodMinutes = Number(values.get('daily.period_duration_minutes'));
  const dailyBreakMinutes = Number(values.get('daily.break_duration_minutes'));
  const dailyGoalieId = String(values.get('daily.goalie_id') ?? 'rookie');
  const trainingGoalieId = String(values.get('training.goalie_id') ?? 'rookie');
  const trainingShotsLimit = Number(values.get('training.shots_limit'));
  const trainingDailyCooldownMinutes = Number(values.get('training.daily_cooldown_minutes'));
  const amateurUnlockGoalsRequired = Number(values.get('amateur.unlock_goals_required'));
  const noInventorySkatesTiming = noInventorySkatesFields.reduce<DuelInventoryTiming>(
    (timing, field) => ({
      ...timing,
      [field.field]: Number(
        values.get(`amateur.no_inventory.skates.${field.key}`) ??
          DEFAULT_DUEL_INVENTORY_TIMING[field.field],
      ),
    }),
    { ...DEFAULT_DUEL_INVENTORY_TIMING },
  );
  const noInventoryNutritionTiming = noInventoryNutritionFields.reduce<DuelInventoryTiming>(
    (timing, field) => ({
      ...timing,
      [field.field]: Number(
        values.get(`amateur.no_inventory.nutrition.${field.key}`) ??
          DEFAULT_DUEL_INVENTORY_TIMING[field.field],
      ),
    }),
    { ...DEFAULT_DUEL_INVENTORY_TIMING },
  );
  const periodSpeedPresets = DAILY_PERIOD_SPEED_PRESETS.map((preset) => ({
    periodNumber: preset.periodNumber,
    goalFrequency: Number(
      values.get(dailySpeedSettingKey(preset.periodNumber, 'goal_frequency')) ??
        preset.goalFrequency,
    ),
    goalieFrequency: Number(
      values.get(dailySpeedSettingKey(preset.periodNumber, 'goalie_frequency')) ??
        preset.goalieFrequency,
    ),
    shooterFrequency: Number(
      values.get(dailySpeedSettingKey(preset.periodNumber, 'shooter_frequency')) ??
        preset.shooterFrequency,
    ),
    puckSpeedPerMs: Number(
      values.get(dailySpeedSettingKey(preset.periodNumber, 'puck_speed_per_ms')) ??
        preset.puckSpeedPerMs,
    ),
  }));

  return {
    daily: {
      shotsPerPeriod: Number.isFinite(dailyShotsPerPeriod)
        ? dailyShotsPerPeriod
        : DEFAULT_DAILY_RULES.shotsPerPeriod,
      periodDurationMs:
        (Number.isFinite(dailyPeriodMinutes)
          ? dailyPeriodMinutes
          : DEFAULT_DAILY_RULES.periodDurationMs / 60000) * 60000,
      breakDurationMs:
        (Number.isFinite(dailyBreakMinutes)
          ? dailyBreakMinutes
          : DEFAULT_DAILY_RULES.breakDurationMs / 60000) * 60000,
      totalPeriods: TOTAL_PERIODS,
      goalieId: dailyGoalieId,
      periodSpeedPresets,
    },
    training: {
      goalieId: trainingGoalieId,
      shotsLimit: Number.isFinite(trainingShotsLimit) ? trainingShotsLimit : 500,
      dailyCooldownMinutes: Number.isFinite(trainingDailyCooldownMinutes)
        ? Math.max(0, Math.trunc(trainingDailyCooldownMinutes))
        : 30,
    },
    amateur: {
      unlockGoalsRequired: Number.isFinite(amateurUnlockGoalsRequired)
        ? Math.max(0, Math.trunc(amateurUnlockGoalsRequired))
        : 300,
      noInventoryTiming: {
        skates: noInventorySkatesTiming,
        nutrition: noInventoryNutritionTiming,
      },
    },
  };
}

export function getConfiguredDailyPeriodSpeedPreset(
  presets: readonly DailyPeriodSpeedPreset[],
  periodNumber: number,
): DailyPeriodSpeedPreset {
  const normalized = Math.min(3, Math.max(1, Math.trunc(periodNumber))) as 1 | 2 | 3;
  return (
    presets.find((preset) => preset.periodNumber === normalized) ??
    getDailyPeriodSpeedPreset(normalized)
  );
}

export async function saveGameSetting(
  pool: Queryable,
  key: string,
  value: unknown,
  adminUserId: string,
): Promise<GameSettingDTO> {
  const validated = validateGameSettingValue(key, value);
  const { rows } = await pool.query<SettingRow>(
    `insert into game_settings (key, value, label, description, updated_by, updated_at)
     values ($1, $2::jsonb, $3, $4, $5, now())
     on conflict (key) do update
       set value = excluded.value,
           label = excluded.label,
           description = excluded.description,
           updated_by = excluded.updated_by,
           updated_at = now()
     returning key, value, updated_at, updated_by`,
    [
      key,
      JSON.stringify(validated.value),
      validated.definition.label,
      validated.definition.description,
      adminUserId,
    ],
  );
  const row = rows[0]!;
  return {
    ...validated.definition,
    value: normalizeValue(row.value, validated.definition),
    updatedAt: row.updated_at?.toISOString() ?? null,
    updatedBy: row.updated_by,
  };
}
