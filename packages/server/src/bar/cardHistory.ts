import type { Pool } from 'pg';
import { z } from 'zod';
export const cardResultSchema = z.object({
  id: z.string().uuid(), character: z.enum(['maria','daria','grigory','arsenich']),
  result: z.enum(['win','loss','draw']), startedAt: z.string().datetime(), endedAt: z.string().datetime(),
  surrendered: z.boolean(), caughtCheats: z.number().int().min(0).max(2),
}).strict().refine(value => Date.parse(value.endedAt) >= Date.parse(value.startedAt), 'invalid_time')
  .refine(value => !value.surrendered || value.result === 'loss', 'invalid_surrender')
  .refine(value => value.character === 'grigory' || value.caughtCheats === 0, 'invalid_cheat');
export type CardResult = z.infer<typeof cardResultSchema>;
export interface CardHistoryStore { save(user: string, match: CardResult): Promise<boolean> }
export class SqlCardHistoryStore implements CardHistoryStore {
  constructor(private readonly pool: Pool) {}
  async save(user: string, match: CardResult): Promise<boolean> {
    // A UUID cannot be reassigned to another owner or silently change an existing result.
    const { rows } = await this.pool.query(
      `insert into bar_computer_card_history(id,user_id,character_id,result,started_at,ended_at,surrendered,caught_cheats)
       values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(id) do update set id=bar_computer_card_history.id
       where bar_computer_card_history.user_id=excluded.user_id and bar_computer_card_history.character_id=excluded.character_id
       and bar_computer_card_history.result=excluded.result and bar_computer_card_history.started_at=excluded.started_at
       and bar_computer_card_history.ended_at=excluded.ended_at and bar_computer_card_history.surrendered=excluded.surrendered
       and bar_computer_card_history.caught_cheats=excluded.caught_cheats returning id`,
      [match.id,user,match.character,match.result,match.startedAt,match.endedAt,match.surrendered,match.caughtCheats],
    );
    return rows.length === 1;
  }
  async memories(user: string, character: string) {
    const [counts, recent] = await Promise.all([
      this.pool.query(`select result,count(*)::integer as count from bar_computer_card_history where user_id=$1 and character_id=$2 group by result`, [user,character]),
      this.pool.query(`select id,result,started_at,ended_at,surrendered,caught_cheats,provenance from bar_computer_card_history where user_id=$1 and character_id=$2 order by ended_at desc,id desc limit 5`, [user,character]),
    ]);
    return { perspective: 'Результаты относительно игрока; источник — клиент игры. Ходы не записаны.', counts: counts.rows, recent: recent.rows };
  }
}
