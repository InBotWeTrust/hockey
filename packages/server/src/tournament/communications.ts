import type { Pool, PoolClient, QueryResult } from 'pg';
import { ensureDefaultNewsChannel, findOrCreateDM, sendMessage } from '../chat/service.js';
import { publishMessageNew, type EventPublisher } from '../chat/events.js';
import { AppError } from '../plugins/errors.js';
import { enqueueTournamentPush } from '../push/tournament.js';

export type TournamentAudience = 'approved' | 'all_participants' | 'all_players';

interface TournamentAnnouncementAction {
  type: 'tournament';
  label: 'Перейти в турнир';
  url: string;
}

function tournamentAnnouncementAction(tournamentId: string): TournamentAnnouncementAction {
  return {
    type: 'tournament',
    label: 'Перейти в турнир',
    url: `/?view=amateur&section=tournaments&tournament=${encodeURIComponent(tournamentId)}&tab=overview&from=sections`,
  };
}

const DISPATCH_LOCK_RETRY_DELAY_MS = 10;
const DISPATCH_LOCK_ACQUIRE_TIMEOUT_MS = 1_000;

function dispatchLockTimeoutError(): AppError {
  return new AppError('service_unavailable', 'tournament dispatch lock acquisition timed out', 503);
}

function dispatchLockDeadlineExpired(deadlineAt: number): boolean {
  return performance.now() >= deadlineAt;
}

function safelyReleaseDispatchLockClient(client: PoolClient, destroy = false): void {
  try {
    client.release(destroy);
  } catch {
    // The deadline error remains authoritative even if the pool rejects a late release.
  }
}

function connectBeforeDispatchLockDeadline(pool: Pool, deadlineAt: number): Promise<PoolClient> {
  const remainingMs = deadlineAt - performance.now();
  if (remainingMs <= 0) return Promise.reject(dispatchLockTimeoutError());

  const connection = pool.connect();
  return new Promise<PoolClient>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(dispatchLockTimeoutError());
    }, remainingMs);

    void connection
      .then(
        (client) => {
          if (settled) {
            safelyReleaseDispatchLockClient(client);
            return;
          }
          if (dispatchLockDeadlineExpired(deadlineAt)) {
            settled = true;
            clearTimeout(timer);
            safelyReleaseDispatchLockClient(client);
            reject(dispatchLockTimeoutError());
            return;
          }
          settled = true;
          clearTimeout(timer);
          resolve(client);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(dispatchLockDeadlineExpired(deadlineAt) ? dispatchLockTimeoutError() : error);
        },
      )
      .catch(() => undefined);
  });
}

function tryDispatchLockBeforeDeadline(
  client: PoolClient,
  lockKey: string,
  deadlineAt: number,
): Promise<boolean> {
  const remainingMs = deadlineAt - performance.now();
  if (remainingMs <= 0) {
    safelyReleaseDispatchLockClient(client, true);
    return Promise.reject(dispatchLockTimeoutError());
  }

  let query: Promise<QueryResult<{ acquired: boolean }>>;
  try {
    query = client.query<{ acquired: boolean }>(
      `select pg_try_advisory_lock(hashtext($1)) as acquired`,
      [lockKey],
    );
  } catch (error) {
    safelyReleaseDispatchLockClient(client, true);
    return Promise.reject(error);
  }
  return new Promise<boolean>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      safelyReleaseDispatchLockClient(client, true);
      reject(dispatchLockTimeoutError());
    }, remainingMs);

    void query
      .then(
        (result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (dispatchLockDeadlineExpired(deadlineAt)) {
            safelyReleaseDispatchLockClient(client, true);
            reject(dispatchLockTimeoutError());
            return;
          }
          if (result.rows[0]?.acquired === true) {
            resolve(true);
            return;
          }
          try {
            client.release();
            resolve(false);
          } catch (error) {
            reject(error);
          }
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          safelyReleaseDispatchLockClient(client, true);
          reject(dispatchLockDeadlineExpired(deadlineAt) ? dispatchLockTimeoutError() : error);
        },
      )
      .catch(() => undefined);
  });
}

async function acquireDispatchLock(pool: Pool, lockKey: string): Promise<PoolClient> {
  const deadlineAt = performance.now() + DISPATCH_LOCK_ACQUIRE_TIMEOUT_MS;
  let acquiredClient: PoolClient | null = null;
  while (acquiredClient === null) {
    const client = await connectBeforeDispatchLockDeadline(pool, deadlineAt);
    if (await tryDispatchLockBeforeDeadline(client, lockKey, deadlineAt)) acquiredClient = client;
    if (acquiredClient !== null) continue;

    const remainingMs = deadlineAt - performance.now();
    if (remainingMs <= 0) throw dispatchLockTimeoutError();
    await new Promise<void>((resolve) =>
      setTimeout(resolve, Math.min(DISPATCH_LOCK_RETRY_DELAY_MS, remainingMs)),
    );
  }
  return acquiredClient;
}

function audienceStates(audience: TournamentAudience): string[] {
  return audience === 'approved'
    ? ['approved']
    : ['invited', 'applied', 'approved', 'withdrawn', 'removed', 'disqualified'];
}

export async function previewTournamentAudience(
  pool: Pool,
  tournamentId: string,
  audience: TournamentAudience,
) {
  if (audience === 'all_players') {
    const { rows } = await pool.query<{
      user_id: string;
      display_name: string;
      state: string;
    }>(
      `select u.id as user_id, u.display_name, 'player'::text as state
         from users u
        where u.account_kind = 'player' and u.blocked_at is null
        order by u.display_name, u.id`,
      [],
    );
    return { count: rows.length, recipients: rows };
  }
  const states = audienceStates(audience);
  const { rows } = await pool.query<{ user_id: string; display_name: string; state: string }>(
    `select p.user_id, u.display_name, p.state
       from tournament_participant p join users u on u.id = p.user_id
      where p.tournament_id = $1 and p.state = any($2::text[])
      order by u.display_name, p.user_id`,
    [tournamentId, states],
  );
  return { count: rows.length, recipients: rows };
}

export async function dispatchTournamentCommunication(
  pool: Pool,
  publisher: EventPublisher,
  input: {
    tournamentId: string;
    idempotencyKey: string;
    kind: 'push' | 'direct_message' | 'official_news';
    audience: TournamentAudience;
    title: string;
    body: string;
    includeTournamentButton?: boolean;
    createdBy: string;
    systemUserId?: string;
    invalidateUnreadCache?: (userId: string) => Promise<void>;
  },
) {
  if (
    (input.kind === 'direct_message' || input.kind === 'official_news') &&
    input.systemUserId === undefined
  ) {
    throw new AppError('configuration_error', 'SYSTEM_USER_ID is required', 409);
  }
  const lockKey = `tournament-dispatch:${input.idempotencyKey}`;
  const lockClient = await acquireDispatchLock(pool, lockKey);
  try {
    type DispatchRow = {
      id: string;
      tournament_id: string;
      kind: 'push' | 'direct_message' | 'official_news';
      audience_snapshot: unknown;
      payload_snapshot: unknown;
      status: string;
      recipient_count: number;
      delivered_count: number;
      failed_count: number;
      created_by: string | null;
    };
    let dispatch = (
      await lockClient.query<DispatchRow>(
        `select id, tournament_id, kind, audience_snapshot, payload_snapshot, status,
                recipient_count, delivered_count, failed_count, created_by
           from tournament_dispatch where idempotency_key = $1`,
        [input.idempotencyKey],
      )
    ).rows[0];
    if (dispatch && dispatch.tournament_id !== input.tournamentId) {
      throw new AppError('conflict', 'idempotency key belongs to another tournament', 409);
    }
    if (!dispatch) {
      const newsChannel =
        input.kind === 'official_news'
          ? await ensureDefaultNewsChannel(pool, input.systemUserId!)
          : null;
      const audience =
        newsChannel === null
          ? await previewTournamentAudience(pool, input.tournamentId, input.audience)
          : { count: 1, recipients: [] };
      const audienceSnapshot =
        newsChannel === null
          ? {
              audience: input.audience,
              recipients: audience.recipients.map((row) => row.user_id),
              ...(input.kind === 'direct_message' ? { systemUserId: input.systemUserId } : {}),
            }
          : {
              audience: input.audience,
              recipients: [],
              channelId: newsChannel.id,
              channelSlug: newsChannel.channel_slug,
            };
      dispatch = (
        await lockClient.query<DispatchRow>(
          `insert into tournament_dispatch
             (tournament_id, idempotency_key, kind, event_key, audience_snapshot,
              payload_snapshot, recipient_count, created_by)
           values ($1, $2, $3, 'tournament.manual', $4, $5, $6, $7)
           returning id, tournament_id, kind, audience_snapshot, payload_snapshot, status,
                     recipient_count, delivered_count, failed_count, created_by`,
          [
            input.tournamentId,
            input.idempotencyKey,
            input.kind,
            JSON.stringify(audienceSnapshot),
            JSON.stringify({
              title: input.title,
              body: input.body,
              ...(input.includeTournamentButton === true
                ? { action: tournamentAnnouncementAction(input.tournamentId) }
                : {}),
            }),
            audience.count,
            input.createdBy,
          ],
        )
      ).rows[0]!;
    }
    const dispatchId = dispatch.id;
    if (dispatch.status === 'sent') {
      return {
        dispatchId,
        status: 'sent',
        recipients: Number(dispatch.recipient_count),
        delivered: Number(dispatch.delivered_count),
        failed: Number(dispatch.failed_count),
      };
    }
    const audienceSnapshot =
      typeof dispatch.audience_snapshot === 'object' &&
      dispatch.audience_snapshot !== null &&
      !Array.isArray(dispatch.audience_snapshot)
        ? (dispatch.audience_snapshot as Record<string, unknown>)
        : {};
    const payloadSnapshot =
      typeof dispatch.payload_snapshot === 'object' &&
      dispatch.payload_snapshot !== null &&
      !Array.isArray(dispatch.payload_snapshot)
        ? (dispatch.payload_snapshot as Record<string, unknown>)
        : {};
    const title = payloadSnapshot.title;
    const body = payloadSnapshot.body;
    const action =
      typeof payloadSnapshot.action === 'object' &&
      payloadSnapshot.action !== null &&
      !Array.isArray(payloadSnapshot.action)
        ? (payloadSnapshot.action as Record<string, unknown>)
        : null;
    const announcementAction =
      action?.type === 'tournament' &&
      action.label === 'Перейти в турнир' &&
      typeof action.url === 'string'
        ? (action as unknown as TournamentAnnouncementAction)
        : null;
    const recipientIds = audienceSnapshot.recipients;
    if (
      typeof title !== 'string' ||
      typeof body !== 'string' ||
      !Array.isArray(recipientIds) ||
      !recipientIds.every((recipientId): recipientId is string => typeof recipientId === 'string')
    ) {
      throw new AppError('configuration_error', 'tournament dispatch snapshot is invalid', 409);
    }
    await lockClient.query(
      `update tournament_dispatch
          set status = 'sending', completed_at = null
        where id = $1 and status <> 'sent'`,
      [dispatchId],
    );
    let delivered = 0;
    let failed = 0;
    if (dispatch.kind === 'official_news') {
      const channelId = audienceSnapshot.channelId;
      const senderId = input.systemUserId;
      try {
        if (typeof channelId !== 'string' || senderId === undefined)
          throw new Error('invalid news snapshot');
        const existing = await pool.query<{ id: string }>(
          `select id from messages
            where chat_id = $1 and metadata->>'tournamentDispatchId' = $2
            limit 1`,
          [channelId, dispatchId],
        );
        if (existing.rows[0]) {
          delivered = 1;
        } else {
          const message = await sendMessage(pool, {
            chatId: channelId,
            senderId,
            content: body,
            metadata: {
              type: 'tournament_announcement',
              title,
              tournamentId: dispatch.tournament_id,
              tournamentDispatchId: dispatchId,
              ...(announcementAction !== null ? { action: announcementAction } : {}),
            },
          });
          await publishMessageNew(pool, publisher, channelId, 'channel', message);
          delivered = 1;
        }
        if (input.invalidateUnreadCache !== undefined) {
          const users = await pool.query<{ id: string }>(`select id from users`);
          await Promise.all(users.rows.map((user) => input.invalidateUnreadCache!(user.id)));
        }
      } catch {
        failed = 1;
      }
    } else {
      for (const recipientId of recipientIds) {
        try {
          if (dispatch.kind === 'push') {
            const eventKey = `${dispatchId}:${recipientId}`;
            const queued = await enqueueTournamentPush(pool, {
              tournamentId: dispatch.tournament_id,
              userId: recipientId,
              eventType: 'tournament.manual',
              eventKey,
              variables: { title, body },
              fallback: {
                title,
                body,
                url: announcementAction?.url ?? '/?view=amateur&section=tournaments',
              },
            });
            const existing = queued
              ? true
              : Boolean(
                  (
                    await pool.query<{ id: string }>(
                      `select id from push_delivery_log
                        where user_id = $1 and event_type = 'tournament.manual' and event_key = $2`,
                      [recipientId, eventKey],
                    )
                  ).rows[0],
                );
            if (existing) delivered += 1;
            else failed += 1;
          } else {
            const systemUserId = audienceSnapshot.systemUserId;
            if (typeof systemUserId !== 'string') throw new Error('invalid DM snapshot');
            const existing = await pool.query<{ id: string }>(
              `select id from messages
                where sender_id = $1
                  and metadata->>'tournamentDispatchId' = $2
                  and metadata->>'recipientUserId' = $3
                limit 1`,
              [systemUserId, dispatchId, recipientId],
            );
            if (existing.rows[0]) {
              delivered += 1;
              continue;
            }
            const dm = await findOrCreateDM(pool, systemUserId, recipientId);
            const message = await sendMessage(pool, {
              chatId: dm.chatId,
              senderId: systemUserId,
              content: body,
              metadata: {
                type: 'tournament_announcement',
                title,
                tournamentId: dispatch.tournament_id,
                tournamentDispatchId: dispatchId,
                recipientUserId: recipientId,
                ...(announcementAction !== null ? { action: announcementAction } : {}),
              },
            });
            await publishMessageNew(pool, publisher, dm.chatId, 'direct', message);
            delivered += 1;
          }
        } catch {
          failed += 1;
        }
      }
    }
    const status = failed === 0 ? 'sent' : delivered === 0 ? 'failed' : 'partially_failed';
    await lockClient.query(
      `update tournament_dispatch
          set status = $2, delivered_count = $3, failed_count = $4, completed_at = now()
        where id = $1`,
      [dispatchId, status, delivered, failed],
    );
    return {
      dispatchId,
      status,
      recipients: Number(dispatch.recipient_count),
      delivered,
      failed,
    };
  } finally {
    await lockClient
      .query(`select pg_advisory_unlock(hashtext($1))`, [lockKey])
      .catch(() => undefined);
    lockClient.release();
  }
}

export async function listTournamentDispatches(pool: Pool, tournamentId: string) {
  const { rows } = await pool.query(
    `select id, idempotency_key, kind, event_key, audience_snapshot, payload_snapshot,
            status, recipient_count, delivered_count, failed_count, created_at, completed_at
       from tournament_dispatch where tournament_id = $1 order by created_at desc`,
    [tournamentId],
  );
  return rows;
}
