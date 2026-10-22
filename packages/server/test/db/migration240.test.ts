import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {expect,it} from 'vitest';

const url=process.env.BAR_GAMES_TEST_DATABASE_URL??process.env.TEST_DATABASE_URL;
it.skipIf(!url)('enables ordinary fights idempotently without changing the runtime rollout or other settings',async()=>{
 const admin=new Pool({connectionString:url});
 const schema=`fight_rollout_${randomUUID().replaceAll('-','')}`;
 await admin.query(`create schema ${schema}`);
 const pool=new Pool({connectionString:url,options:`-c search_path=${schema}`});
 try {
  await pool.query('create table game_settings(key text primary key,value jsonb not null,label text not null,description text)');
  await pool.query(`insert into game_settings values ('duels.fights.enabled','false','Fights',''),('duels.fights.runtime.enabled','false','Runtime',''),('other','42','Other','')`);
  const sql=await readFile(new URL('../../db/migrations/240_enable_ordinary_duel_fights.sql',import.meta.url),'utf8');
  await pool.query(sql);await pool.query(sql);
  const rows=await pool.query('select key,value from game_settings order by key');
  expect(Object.fromEntries(rows.rows.map(row=>[row.key,row.value]))).toEqual({'duels.fights.enabled':true,'duels.fights.runtime.enabled':false,other:42});
 } finally {await pool.end();await admin.query(`drop schema ${schema} cascade`);await admin.end();}
});
