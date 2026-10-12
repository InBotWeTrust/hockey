import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {SqlConflictStore} from './conflict.js';
const url=process.env.TEST_DATABASE_URL;
const schema='bar_phrases_'+randomUUID().replaceAll('-','');
let admin:Pool,db:Pool;
beforeAll(async()=>{
 if(!url)return;
 const parsed=new URL(url);
 if(!['localhost','127.0.0.1'].includes(parsed.hostname)||!parsed.pathname.includes('test'))throw new Error('Dedicated local test database required');
 admin=new Pool({connectionString:url});await admin.query(`create schema "${schema}"`);
 db=new Pool({connectionString:url,options:`-c search_path=${schema}`});
 const original=readFileSync(new URL('../../db/migrations/205_bar_oleg_conflicts.sql',import.meta.url),'utf8');
 const physical=readFileSync(new URL('../../db/migrations/206_bar_physical_incidents.sql',import.meta.url),'utf8');
 await db.query(original.match(/create table bar_oleg_phrases \([\s\S]*?;/)![0]);
 for(const content of [original,physical])await db.query(content.match(/insert into bar_oleg_phrases[\s\S]*?;/)![0]);
});
afterAll(async()=>{if(db)await db.end();if(admin){await admin.query(`drop schema "${schema}" cascade`);await admin.end();}});
it.skipIf(!url)('verbal choices never use physical phrases while physical pools stay intact',async()=>{
 const store=new SqlConflictStore(db);
 for(const category of ['insult','sexual'] as const){
  const allowed=(await db.query("select content from bar_oleg_phrases where kind='intervention' and category=$1 and not starts_with(id,'touch-')",[category])).rows.map(r=>r.content);
  for(let n=0;n<30;n++)expect(allowed).toContain(await store.phrase('intervention',category));
 }
 for(const prefix of ['touch-woman-','touch-man-','touch-oleg-'])expect((await db.query('select content from bar_oleg_phrases where starts_with(id,$1)',[prefix])).rows).toHaveLength(2);
});
