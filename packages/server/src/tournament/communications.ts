import type { Pool, PoolClient } from 'pg';
import { ensureDefaultNewsChannel, findOrCreateDM, sendMessage } from '../chat/service.js';
import { publishMessageNew, type EventPublisher } from '../chat/events.js';
import { AppError } from '../plugins/errors.js';
import { enqueueTournamentPush } from '../push/tournament.js';

export type TournamentAudience = 'approved' | 'all_participants';

const DISPATCH_LOCK_RETRY_DELAY_MS = 10;
const DISPATCH_LOCK_MAX_ATTEMPTS = 100;

async function acquireDispatchLock(pool: Pool, lockKey: string): Promise<PoolClient> {
  let acquiredClient: PoolClient | null = null;
  let attempts = 0;
  while (acquiredClient === null) {
    const client = await pool.connect();
    try {
      const lock = await client.query<{ acquired: boolean }>(
        `select pg_try_advisory_lock(hashtext($1)) as acquired`,
        [lockKey],
      );
      if (lock.rows[0]?.acquired === true) acquiredClient = client;
      else client.release();
    } catch (error) {
      client.release();
      throw error;
    }
    if (acquiredClient === null) {
      attempts += 1;
      if (attempts >= DISPATCH_LOCK_MAX_ATTEMPTS) {
        throw new AppError(
          'service_unavailable',
          'tournament dispatch lock acquisition timed out',
          503,
        );
      }
      await new Promise<void>((resolve) => setTimeout(resolve, DISPATCH_LOCK_RETRY_DELAY_MS));
    }
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
    createdBy: string;
    systemUserId?: string;
  },
) {
  if (input.kind === 'direct_message' && input.systemUserId === undefined) {
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
          ? await ensureDefaultNewsChannel(pool, input.createdBy)
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
            JSON.stringify({ title: input.title, body: input.body }),
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
      const senderId = dispatch.created_by;
      try {
        if (typeof channelId !== 'string' || senderId === null)
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
            },
          });
          await publishMessageNew(pool, publisher, channelId, 'channel', message);
          delivered = 1;
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
                url: '/?view=amateur&section=tournaments',
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
