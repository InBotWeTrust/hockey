import type { Pool } from 'pg';
import { findOrCreateDM, sendMessage } from '../chat/service.js';
import { publishMessageNew, type EventPublisher } from '../chat/events.js';
import { AppError } from '../plugins/errors.js';
import { enqueueTournamentPush } from '../push/tournament.js';

export type TournamentAudience = 'approved' | 'all_participants';

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
    kind: 'push' | 'direct_message';
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
  const recipients = await previewTournamentAudience(pool, input.tournamentId, input.audience);
  const dispatch = await pool.query<{
    id: string;
    status: string;
    recipient_count: number;
    delivered_count: number;
    failed_count: number;
  }>(
    `insert into tournament_dispatch
       (tournament_id, idempotency_key, kind, event_key, audience_snapshot,
        payload_snapshot, recipient_count, created_by)
     values ($1, $2, $3, 'tournament.manual', $4, $5, $6, $7)
     on conflict (idempotency_key) do update set idempotency_key = excluded.idempotency_key
     returning id, status, recipient_count, delivered_count, failed_count`,
    [
      input.tournamentId,
      input.idempotencyKey,
      input.kind,
      JSON.stringify({ audience: input.audience, recipients: recipients.recipients.map((row) => row.user_id) }),
      JSON.stringify({ title: input.title, body: input.body }),
      recipients.count,
      input.createdBy,
    ],
  );
  const dispatchId = dispatch.rows[0]!.id;
  if (dispatch.rows[0]!.status === 'sent') {
    return {
      dispatchId,
      status: 'sent',
      recipients: Number(dispatch.rows[0]!.recipient_count),
      delivered: Number(dispatch.rows[0]!.delivered_count),
      failed: Number(dispatch.rows[0]!.failed_count),
    };
  }
  await pool.query(`update tournament_dispatch set status = 'sending' where id = $1 and status <> 'sent'`, [
    dispatchId,
  ]);
  let delivered = 0;
  let failed = 0;
  for (const recipient of recipients.recipients) {
    try {
      if (input.kind === 'push') {
        const queued = await enqueueTournamentPush(pool, {
          userId: recipient.user_id,
          eventType: 'tournament.manual',
          eventKey: `${dispatchId}:${recipient.user_id}`,
          variables: { title: input.title, body: input.body },
          fallback: {
            title: input.title,
            body: input.body,
            url: '/?view=amateur&section=tournaments',
          },
        });
        if (queued) delivered += 1;
        else failed += 1;
      } else {
        const existing = await pool.query<{ id: string }>(
          `select id from messages
            where sender_id = $1
              and metadata->>'tournamentDispatchId' = $2
              and metadata->>'recipientUserId' = $3
            limit 1`,
          [input.systemUserId, dispatchId, recipient.user_id],
        );
        if (existing.rows[0]) {
          delivered += 1;
          continue;
        }
        const dm = await findOrCreateDM(pool, input.systemUserId!, recipient.user_id);
        const message = await sendMessage(pool, {
          chatId: dm.chatId,
          senderId: input.systemUserId!,
          content: input.body,
          metadata: {
            type: 'tournament_announcement',
            title: input.title,
            tournamentId: input.tournamentId,
            tournamentDispatchId: dispatchId,
            recipientUserId: recipient.user_id,
          },
        });
        await publishMessageNew(pool, publisher, dm.chatId, 'direct', message);
        delivered += 1;
      }
    } catch {
      failed += 1;
    }
  }
  const status = failed === 0 ? 'sent' : delivered === 0 ? 'failed' : 'partially_failed';
  await pool.query(
    `update tournament_dispatch
        set status = $2, delivered_count = $3, failed_count = $4, completed_at = now()
      where id = $1`,
    [dispatchId, status, delivered, failed],
  );
  return { dispatchId, status, recipients: recipients.count, delivered, failed };
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
