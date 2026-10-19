import type {Pool} from 'pg';
// Only this visitor's recorded activity; never another character's private dialogue.
export async function readElinaBehaviour(db:Pick<Pool,'query'>,user:string){
 const [games,cards,fights]=await Promise.all([
  db.query(`select kind,character,ended_at,data->'runtime'->'game'->>'winner' as winner,
    case when player_a=$1 then 0 else 1 end as player
    from bar_game_matches where (player_a=$1 or player_b=$1) and ended_at is not null order by ended_at desc limit 8`,[user]),
  db.query(`select character_id,result,surrendered,ended_at,provenance from bar_computer_card_history where user_id=$1 order by ended_at desc limit 5`,[user]),
  db.query(`select outcome,ended_at from bar_oleg_fights where user_id=$1 and outcome is not null order by created_at desc limit 5`,[user]),
 ]);
 return {source:'Сохранённые события этого посетителя. Участие в драке не доказывает, кто её начал. Результаты карт с provenance=client_reported не подтверждают ходы. В games player — сторона посетителя, winner — выигравшая сторона 0/1 или draw.',games:games.rows,cards:cards.rows,fights:fights.rows};
}
