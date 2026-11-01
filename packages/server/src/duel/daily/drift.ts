import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  createCaretakerGame,
  caretakerGameVersion,
  caretakerGameVariant,
  caretakerGameTarget,
  type CaretakerVariant,
  stepCaretakerGame,
  driftProgress,
  type DriftState,
  type DriftControl,
} from '@hockey/game-core';
import { AppError } from '../../plugins/errors.js';
import { caretakerContext } from './caretaker.js';
import { acceleratedReadyAt } from './caretakerRules.js';
interface Row {
  id: string;
  user_id: string;
  day_pool_id: string;
  period_number: number;
  attempt_id: string;
  attempt_ids: string[];
  kind: string;
  period_end: Date;
  original_ready_at: Date;
  started_at: Date;
  seq: number;
  last_input: DriftControl[] | null;
  completed_at: Date | null;
  drift_seed: string;
  drift_state: DriftState;
  drift_version: number;
}
function view(row: Row, now: Date, showInstruction = false) {
  return {
    variant: caretakerGameVariant(row.drift_state),
    attemptId: row.attempt_id,
    seed: row.drift_seed,
    version: row.drift_version,
    seq: row.seq,
    progress: driftProgress(row.drift_state),
    completed: !!row.completed_at,
    serverNow: now.toISOString(),
    readyAt: new Date(
      row.completed_at
        ? acceleratedReadyAt(+row.period_end, +row.original_ready_at, +row.completed_at)
        : +row.original_ready_at,
    ).toISOString(),
    showInstruction,
  };
}
export async function startDrift(client: PoolClient, user: string, requestId: string, now: Date, requestedVariant?: CaretakerVariant) {
  const { pool, settings } = await caretakerContext(client, user, now);
  if (!pool || pool.state !== 'break_active' || !pool.break_started_at)
    throw new AppError('conflict', 'Уборка доступна во время перерыва.', 409);
  const previous = (
    await client.query<Row>(
      'select * from daily_caretaker where day_pool_id=$1 and period_number=$2 for update',
      [pool.id, pool.current_period],
    )
  ).rows[0];
  if (previous?.completed_at) throw new AppError('conflict', 'Этот лёд уже убран.', 409);
  if (previous?.attempt_id === requestId && previous.kind === 'drift') return view(previous, now);
  if (previous?.attempt_ids.includes(requestId))
    throw new AppError('conflict', 'Попытка уже заменена новой.', 409);
  await client.query(
    'insert into daily_caretaker_user(user_id) values($1) on conflict do nothing',
    [user],
  );
  let variant: CaretakerVariant;
  if (previous?.kind === 'drift') {
    variant = caretakerGameVariant(previous.drift_state);
  } else if (requestedVariant) {
    // Internal simulation fixtures can select a variant; HTTP starts use the queue.
    variant = requestedVariant;
  } else {
    const last = await client.query<Row>(
      "select * from daily_caretaker where user_id=$1 and kind='drift' order by started_at desc, id desc limit 1",
      [user],
    );
    variant = last.rows[0] && caretakerGameVariant(last.rows[0].drift_state) === 'drift' ? 'blizzard' : 'drift';
  }
  const introColumn=variant==='blizzard'?'blizzard_introduced_at':'drift_introduced_at';
  const intro = await client.query(
    `update daily_caretaker_user set ${introColumn}=$2,introduced_at=coalesce(introduced_at,$2) where user_id=$1 and ${introColumn} is null returning user_id`,
    [user, now],
  );
  const seed = randomUUID(),
    physics = createCaretakerGame(seed,variant);
  const row = previous
    ? (
        await client.query<Row>(
          `update daily_caretaker set kind='drift',attempt_id=$2,attempt_ids=array_append(attempt_ids,$2),started_at=$3,updated_at=$3,seq=0,last_input=null,progress='{"value":0,"cycle":-1}',drift_seed=$4,drift_state=$5,drift_version=$6 where id=$1 returning *`,
          [previous.id, requestId, now, seed, physics, caretakerGameVersion(caretakerGameVariant(physics))],
        )
      ).rows[0]!
    : (
        await client.query<Row>(
          `insert into daily_caretaker(user_id,day_pool_id,period_number,kind,period_end,original_ready_at,attempt_id,attempt_ids,started_at,updated_at,drift_seed,drift_state,drift_version) values($1,$2,$3,'drift',$4,$5,$6,array[$6]::uuid[],$7,$7,$8,$9,$10) returning *`,
          [
            user,
            pool.id,
            pool.current_period,
            pool.break_started_at,
            new Date(+pool.break_started_at + settings.daily.breakDurationMs),
            requestId,
            now,
            seed,
            physics,
            caretakerGameVersion(variant),
          ],
        )
      ).rows[0]!;
  await client.query("select record_novice_funnel($1,'caretaker_started',$2,$3,$4)", [
    user,
    row.id,
    { kind: caretakerGameVariant(row.drift_state), period: row.period_number },
    now,
  ]);
  return view(row, now, intro.rowCount === 1);
}
const same = (a: DriftControl[] | null, b: DriftControl[]) =>
  a?.length === b.length &&
  a.every((v, i) => v.x === b[i]!.x && v.y === b[i]!.y && v.held === b[i]!.held);
export async function actDrift(
  client: PoolClient,
  user: string,
  attemptId: string,
  seq: number,
  controls: DriftControl[],
  now: Date,
) {
  const { pool } = await caretakerContext(client, user, now);
  const row = (
    await client.query<Row>(
      'select * from daily_caretaker where user_id=$1 and attempt_id=$2 for update',
      [user, attemptId],
    )
  ).rows[0];
  if (
    !row ||
    row.kind !== 'drift' ||
    row.drift_version !== caretakerGameVersion(caretakerGameVariant(row.drift_state)) ||
    !pool ||
    pool.id !== row.day_pool_id ||
    pool.current_period !== row.period_number
  )
    throw new AppError('conflict', 'Этот перерыв уже закончился.', 409);
  if (!row.completed_at && (pool.state !== 'break_active' || +now >= +row.original_ready_at))
    throw new AppError('conflict', 'Этот перерыв уже закончился.', 409);
  if (seq === row.seq) {
    if (!same(row.last_input, controls))
      throw new AppError('conflict', 'Действие отличается от сохранённого.', 409);
    return view(row, now);
  }
  if (row.completed_at) return view(row, now);
  if (seq !== row.seq + 1) throw new AppError('conflict', 'Нарушен порядок действий.', 409);
  if (row.drift_state.ticks + controls.length > (+now - +row.started_at) * 0.06 + 6)
    throw new AppError('conflict', 'Слишком быстрые действия. Попробуй ещё раз.', 409);
  let physics = row.drift_state;
  for (const control of controls) {
    physics = stepCaretakerGame(physics, control);
    if (driftProgress(physics) >= caretakerGameTarget(physics)) break;
  }
  const complete = driftProgress(physics) >= caretakerGameTarget(physics);
  const updated = (
    await client.query<Row>(
      'update daily_caretaker set drift_state=$2,seq=$3,last_input=$4,updated_at=$5,completed_at=$6 where id=$1 returning *',
      [row.id, physics, seq, JSON.stringify(controls), now, complete ? now : null],
    )
  ).rows[0]!;
  if (complete) {
    await client.query('update day_pool set caretaker_ready_at=$2 where id=$1', [
      pool.id,
      new Date(acceleratedReadyAt(+row.period_end, +row.original_ready_at, +now)),
    ]);
    await client.query("select record_novice_funnel($1,'caretaker_completed',$2,$3,$4)", [
      user,
      row.id,
      { kind: caretakerGameVariant(row.drift_state), period: row.period_number },
      now,
    ]);
  }
  return view(updated, now);
}
