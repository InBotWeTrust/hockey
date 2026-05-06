import type { Pool, PoolClient } from 'pg';
import type { PushEventType } from './preferences.js';
import type { WebPushPayload } from './service.js';

export type PushNotificationCategory = 'chat' | 'daily' | 'training' | 'duel' | 'news';

export interface PushNotificationTemplateRow {
  key: PushEventType;
  category: PushNotificationCategory;
  title: string;
  body: string;
  trigger_description: string;
  click_url: string;
  is_enabled: boolean;
  updated_at: Date;
  updated_by: string | null;
  updated_by_display_name: string | null;
}

export interface PushNotificationTemplateDTO {
  key: PushEventType;
  category: PushNotificationCategory;
  title: string;
  body: string;
  trigger: string;
  clickUrl: string;
  isEnabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
  updatedByDisplayName: string | null;
}

export interface PushNotificationTemplatePatch {
  title?: string;
  body?: string;
  trigger?: string;
  clickUrl?: string;
  isEnabled?: boolean;
}

export interface PushTemplateFallback {
  title: string;
  body: string;
  url: string;
}

export type PushTemplateVariables = Record<string, string | number | null | undefined>;

const TEMPLATE_ORDER: PushEventType[] = [
  'chat.new_dialog_message',
  'daily.available',
  'daily.unlocked_after_training',
  'daily.period_ending',
  'daily.break_finished',
  'training.available',
  'duel.challenge_received',
  'duel.result_ready',
  'news.posted',
];

const DEFAULT_PUSH_NOTIFICATION_TEMPLATES: Array<{
  key: PushEventType;
  category: PushNotificationCategory;
  title: string;
  body: string;
  trigger: string;
  clickUrl: string;
}> = [
  {
    key: 'chat.new_dialog_message',
    category: 'chat',
    title: 'Новое сообщение от {{senderName}}',
    body: '{{messagePreview}}',
    trigger: 'Первое сообщение в новом личном диалоге.',
    clickUrl: '/chat/{{chatId}}',
  },
  {
    key: 'daily.available',
    category: 'daily',
    title: 'Ежедневная игра доступна',
    body: 'Новый игровой день уже открыт.',
    trigger: 'Начало нового дня по часовому поясу игрока.',
    clickUrl: '/?view=hub',
  },
  {
    key: 'daily.unlocked_after_training',
    category: 'daily',
    title: 'Ежедневная игра открыта',
    body: 'Восстановление после тренировки завершено.',
    trigger: 'Через 2 часа после последнего тренировочного броска, если дневная игра ещё не начата.',
    clickUrl: '/?view=hub',
  },
  {
    key: 'daily.period_ending',
    category: 'daily',
    title: 'Период скоро закончится',
    body: 'Осталось немного времени на броски.',
    trigger: 'Перед окончанием активного периода ежедневной игры.',
    clickUrl: '/?view=daily',
  },
  {
    key: 'daily.break_finished',
    category: 'daily',
    title: 'Перерыв окончен',
    body: 'Следующий период можно начинать.',
    trigger: 'После окончания перерыва между периодами.',
    clickUrl: '/?view=hub',
  },
  {
    key: 'training.available',
    category: 'training',
    title: 'Тренировка доступна',
    body: 'Можно снова потренироваться.',
    trigger: 'Через 24 часа после прошлой тренировки.',
    clickUrl: '/?view=training',
  },
  {
    key: 'duel.challenge_received',
    category: 'duel',
    title: 'Вас вызвали на дуэль',
    body: '{{challengerName}} ждёт ответа в любительской лиге.',
    trigger: 'Игрок-любитель отправляет вызов на дуэль.',
    clickUrl: '/?view=amateur',
  },
  {
    key: 'duel.result_ready',
    category: 'duel',
    title: 'Дуэль завершена',
    body: '{{resultText}}',
    trigger: 'Дуэль получила итог: победа, поражение, ничья или двойная неявка.',
    clickUrl: '/?view=amateur',
  },
  {
    key: 'news.posted',
    category: 'news',
    title: 'Новости игры',
    body: '{{postContent}}',
    trigger: 'Админ публикует новый пост в новостном канале.',
    clickUrl: '/chat/{{chatId}}',
  },
];

async function ensurePushNotificationTemplates(client: Pool | PoolClient): Promise<void> {
  await client.query(
    `insert into push_notification_templates
       (key, category, title, body, trigger_description, click_url)
     select key, category, title, body, trigger_description, click_url
       from jsonb_to_recordset($1::jsonb)
         as t(
           key text,
           category text,
           title text,
           body text,
           trigger_description text,
           click_url text
         )
     on conflict (key) do nothing`,
    [
      JSON.stringify(
        DEFAULT_PUSH_NOTIFICATION_TEMPLATES.map((template) => ({
          key: template.key,
          category: template.category,
          title: template.title,
          body: template.body,
          trigger_description: template.trigger,
          click_url: template.clickUrl,
        })),
      ),
    ],
  );
}

export function mapPushNotificationTemplate(
  row: PushNotificationTemplateRow,
): PushNotificationTemplateDTO {
  return {
    key: row.key,
    category: row.category,
    title: row.title,
    body: row.body,
    trigger: row.trigger_description,
    clickUrl: row.click_url,
    isEnabled: row.is_enabled,
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by,
    updatedByDisplayName: row.updated_by_display_name,
  };
}

function interpolate(value: string, variables: PushTemplateVariables): string {
  return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const variable = variables[key];
    return variable === null || variable === undefined ? '' : String(variable);
  });
}

export async function listPushNotificationTemplates(
  client: Pool | PoolClient,
): Promise<PushNotificationTemplateRow[]> {
  await ensurePushNotificationTemplates(client);
  const { rows } = await client.query<PushNotificationTemplateRow>(
    `select t.key,
            t.category,
            t.title,
            t.body,
            t.trigger_description,
            t.click_url,
            t.is_enabled,
            t.updated_at,
            t.updated_by::text,
            u.display_name as updated_by_display_name
       from push_notification_templates t
       left join users u on u.id = t.updated_by
      order by array_position($1::text[], t.key), t.key`,
    [TEMPLATE_ORDER],
  );
  return rows;
}

export async function updatePushNotificationTemplate(
  client: Pool | PoolClient,
  key: PushEventType,
  patch: PushNotificationTemplatePatch,
  updatedBy: string,
): Promise<PushNotificationTemplateRow | null> {
  await ensurePushNotificationTemplates(client);
  const assignments: string[] = [];
  const values: unknown[] = [];
  function add(column: string, value: unknown): void {
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  }

  if (patch.title !== undefined) add('title', patch.title);
  if (patch.body !== undefined) add('body', patch.body);
  if (patch.trigger !== undefined) add('trigger_description', patch.trigger);
  if (patch.clickUrl !== undefined) add('click_url', patch.clickUrl);
  if (patch.isEnabled !== undefined) add('is_enabled', patch.isEnabled);
  add('updated_by', updatedBy);
  assignments.push('updated_at = now()');
  values.push(key);

  const { rows } = await client.query<PushNotificationTemplateRow>(
    `update push_notification_templates
        set ${assignments.join(', ')}
      where key = $${values.length}
      returning key,
                category,
                title,
                body,
                trigger_description,
                click_url,
                is_enabled,
                updated_at,
                updated_by::text,
                null::text as updated_by_display_name`,
    values,
  );
  return rows[0] ?? null;
}

export async function renderPushNotificationPayload(
  client: Pool | PoolClient,
  key: PushEventType,
  variables: PushTemplateVariables,
  fallback: PushTemplateFallback,
): Promise<WebPushPayload | null> {
  await ensurePushNotificationTemplates(client);
  const { rows } = await client.query<{
    title: string;
    body: string;
    click_url: string;
    is_enabled: boolean;
  }>(
    `select title, body, click_url, is_enabled
       from push_notification_templates
      where key = $1`,
    [key],
  );
  const row = rows[0];
  if (row && !row.is_enabled) return null;
  const source = row
    ? { title: row.title, body: row.body, url: row.click_url }
    : fallback;
  return {
    title: interpolate(source.title, variables),
    body: interpolate(source.body, variables),
    url: interpolate(source.url, variables),
  };
}
