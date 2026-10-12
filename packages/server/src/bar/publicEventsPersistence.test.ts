import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {SqlPublicBarEvents} from './publicEvents.js';
const url=process.env.BAR_PUBLIC_EVENTS_TEST_DATABASE_URL;
describe.skipIf(!url)('public bar projection in a dedicated database',()=>{
 const pool=new Pool({connectionString:url}),player=randomUUID(),other=randomUUID(),same=randomUUID(),prefix=`Public QA ${randomUUID().slice(0,8)}`;
 const events=new SqlPublicBarEvents(pool);
 beforeAll(async()=>{
  const name=(await pool.query('select current_database() as name')).rows[0].name as string;
  if(!name.startsWith('uh_bar_oleg_test_'))throw new Error('Dedicated bar projection database required');
  for(const statement of (await readFile(new URL('../../db/migrations/207_bar_public_events_indexes.sql',import.meta.url),'utf8')).split('-- hockey:migration-statement'))await pool.query(statement);
  await pool.query("insert into users(id,display_name,timezone) values($1,$4,'UTC'),($2,$5,'UTC'),($3,$5,'UTC')",[player,other,same,prefix,`${prefix} duplicate`]);
  await pool.query(`insert into bar_computer_card_history(id,user_id,character_id,result,started_at,ended_at,surrendered,caught_cheats)
   select gen_random_uuid(),$1,'maria','win',now()-interval '10 minutes',now()-(n*interval '1 second'),false,0 from generate_series(1,100) n`,[player]);
  await pool.query(`insert into bar_oleg_fights(user_id,runtime,status,outcome,ended_at)
   values($1,'{}','resolved','loss',now()),($1,'{}','cancelled','cancelled',now()),($2,'{}','resolved','win',now())`,[player,other]);
 });
 afterAll(async()=>{await pool.query('delete from users where id=any($1::uuid[])',[[player,other,same]]);await pool.end();});
 it('filters 100 simultaneous games by actor and character, and exposes only public facts',async()=>{
  const cards=await events.find({playerName:prefix,kind:'durak',character:'maria',days:1});
  expect(cards.events).toHaveLength(5);expect(cards.hasMore).toBe(true);
  expect(cards.events.every(e=>e.playerName===prefix&&e.character==='maria'&&e.provenance==='client'&&e.winner==='player')).toBe(true);
  expect((await events.find({playerName:prefix,kind:'durak',character:'daria',days:1})).events).toEqual([]);
  const fight=await events.find({playerName:prefix,kind:'fight',character:'oleg',days:1});
  expect(fight.events).toHaveLength(1);expect(fight.events[0]).toMatchObject({winner:'oleg',provenance:'server'});
  expect(JSON.stringify(fight)).not.toMatch(/runtime|user_id|source_turn_id/);
 });
 it('does not choose between duplicate public names and bounds the common feed',async()=>{
  expect(await events.find({playerName:`${prefix} duplicate`,kind:'fight',character:'oleg',days:1})).toMatchObject({ambiguous:true,events:[]});
  expect((await events.find({playerName:'',kind:'any',character:'any',days:1})).events).toHaveLength(5);
 });
});
