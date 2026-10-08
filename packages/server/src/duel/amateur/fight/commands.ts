import { z } from 'zod';
import type { PoolClient } from 'pg';
import { advanceFight, type FightCommand } from '@hockey/game-core';
import type { FightDuelContext } from './routes.js';
import { getFight, denyFight, queueFightSnapshot } from './service.js';
const commandBase = {
  type: z.literal('fight:action'),
  fightId: z.string().uuid(),
  actionId: z.string().uuid(),
  phaseId: z.number().int().nonnegative(),
  seq: z.number().int().positive().max(2147483647),
};
export const fightActionSchema = z.discriminatedUnion('kind', [
  z.object({...commandBase, kind:z.literal('input'), input:z.object({direction:z.union([z.literal(-1),z.literal(0),z.literal(1)]),crouch:z.boolean(),guard:z.boolean()}).strict()}).strict(),
  z
    .object({ ...commandBase, kind: z.enum(['attack', 'block']), zone: z.enum(['head', 'body']) })
    .strict(),
  z
    .object({
      ...commandBase,
      kind: z.literal('move'),
      direction: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
    })
    .strict(),
]);
export type FightActionPayload = z.infer<typeof fightActionSchema>;
export async function admitFightCommand(
  client: PoolClient,
  ctx: FightDuelContext,
  userId: string,
  body: FightActionPayload,
): Promise<{ accepted: boolean; seq: number; reason?: string }> {
  const fight = await getFight(client, ctx.id);
  const player = ctx.participants.findIndex((p) => p.userId === userId);
  if (player !== 0 && player !== 1) denyFight('forbidden');
  if (!fight || fight.id !== body.fightId) denyFight('unknown_fight');
  const duplicate = (
    await client.query<{
      ack: { accepted: boolean; seq: number; reason?: string };
      payload: FightCommand;
    }>(
      'select ack,payload from amateur_duel_fight_command where fight_id=$1 and user_id=$2 and (action_id=$3 or seq=$4)',
      [fight.id, userId, body.actionId, body.seq],
    )
  ).rows[0];
  if (duplicate) {
    if (
      duplicate.payload.seq !== body.seq ||
      duplicate.payload.phaseId !== body.phaseId ||
      duplicate.payload.kind !== body.kind ||
      (duplicate.payload.kind === 'input' && body.kind === 'input'
        ? duplicate.payload.input.direction !== body.input.direction || duplicate.payload.input.crouch !== body.input.crouch || duplicate.payload.input.guard !== body.input.guard
        : duplicate.payload.kind === 'move' && body.kind === 'move'
          ? duplicate.payload.direction !== body.direction
          : 'zone' in duplicate.payload && 'zone' in body && duplicate.payload.zone !== body.zone)
    )
      denyFight('duplicate_payload_mismatch');
    return duplicate.ack;
  }
  const state = fight.engine_state;
  if (
    !state ||
    !['fighting', 'sudden_death'].includes(fight.status) ||
    ctx.nowMs < state.phaseStartedAtMs
  )
    denyFight('not_started');
  if ((body.kind === 'input' && state.rules.version < 3) || (state.rules.version >= 3 && (body.kind === 'move' || body.kind === 'block'))) denyFight('unsupported_action');
  if (body.kind === 'move' && state.rules.version < 2) denyFight('unsupported_action');
  if (body.phaseId !== state.phaseId) denyFight('old_phase');
  if (body.seq !== state.lastSeq[player] + 1) denyFight('sequence');
  const effectiveAtMs = ctx.nowMs - fight.compensation_ms[player];
  if (
    effectiveAtMs < state.phaseStartedAtMs ||
    effectiveAtMs < state.finalizedThroughMs ||
    effectiveAtMs >= state.deadlineMs
  )
    denyFight('late_action');
  const command: FightCommand = {
    player,
    phaseId: body.phaseId,
    seq: body.seq,
    actionId: body.actionId,
    ...(body.kind === 'input' ? { kind:body.kind,input:body.input } : body.kind === 'move'
      ? { kind: body.kind, direction: body.direction }
      : { kind: body.kind, zone: body.zone }),
    effectiveAtMs,
  };
  const transition = advanceFight(
    state,
    [command],
    Math.max(state.finalizedThroughMs, ctx.nowMs - fight.rules.deliveryGraceMs),
  );
  const rejection = transition.events.find(
    (e) => e.type === 'rejected' && e.player === player && e.seq === body.seq,
  );
  const ack =
    rejection?.type === 'rejected'
      ? { accepted: false, seq: body.seq, reason: rejection.reason }
      : { accepted: true, seq: body.seq };
  await client.query(
    'insert into amateur_duel_fight_command(fight_id,user_id,action_id,seq,phase_id,received_at,effective_at_ms,payload,ack) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [
      fight.id,
      userId,
      body.actionId,
      body.seq,
      body.phaseId,
      new Date(ctx.nowMs),
      effectiveAtMs,
      JSON.stringify(command),
      JSON.stringify(ack),
    ],
  );
  await client.query(
    'update amateur_duel_fight set engine_state=$2,revision=revision+1 where id=$1',
    [fight.id, JSON.stringify(transition.state)],
  );
  await queueFightSnapshot(client, ctx.id);
  return ack;
}
