import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it, describe } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { fetchAchievementCatalogueForUser } from '../../src/achievements/service.js';
import { claimCurrentAchievementStage } from '../../src/achievements/claimStage.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

describe.skipIf(!hasIntegrationEnv)('fan level migration',()=>{
  it('preserves old claims, skips already paid levels and never changes balances or feed during backfill',async()=>{
    const pool=createTestPool();const directory=await fs.mkdtemp(path.join(os.tmpdir(),'fan-level-migrations-'));
    const migrations=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../db/migrations');
    try {
      await resetDatabase(pool);
      for(const name of await fs.readdir(migrations))if(name.endsWith('.sql')&&name<'221_')await fs.copyFile(path.join(migrations,name),path.join(directory,name));
      await applyMigrations(pool,directory);
      const userId=randomUUID();
      await pool.query("insert into users(id,display_name,timezone,xp,experience) values($1,'Migrated','Europe/Moscow',10,10)",[userId]);
      await pool.query("insert into user_achievements(user_id,achievement_id,completed_at,claimed_at,completion_context) values($1,'fans-10',now()-interval '2 days',now()-interval '1 day','{\"followersCount\":20}'),($1,'fans-20',now(),null,'{\"followersCount\":20}')",[userId]);
      const finishedId=randomUUID();
      await pool.query("insert into users(id,display_name,timezone,xp,experience) values($1,'Finished','Europe/Moscow',500,500)",[finishedId]);
      for(const threshold of [1,10,20,50,100,500,1000])await pool.query("insert into user_achievements(user_id,achievement_id,completed_at,claimed_at) values($1,$2,now(),now())",[finishedId,`fans-${threshold}`]);
      const before=(await pool.query('select count(*)::int n from social_activity')).rows[0]!.n;
      await applyMigrations(pool,migrations);
      expect((await pool.query('select xp,experience from users where id=$1',[userId])).rows[0]).toMatchObject({xp:10,experience:10});
      expect((await pool.query('select count(*)::int n from social_activity')).rows[0]!.n).toBe(before);
      expect((await pool.query('select count(*)::int n from user_achievements where user_id=$1',[userId])).rows[0]!.n).toBe(2);
      const list=await fetchAchievementCatalogueForUser(pool,userId);
      const chain=list.filter(a=>a.id.startsWith('fans-'));
      expect(chain).toHaveLength(1);expect(chain[0]!.stage).toMatchObject({current:1,total:7,progressValue:20,history:[{stageNumber:2}]});
      const db=await pool.connect();
      try {
        await db.query('begin');const claim=await claimCurrentAchievementStage(db,userId,'fans-support',new Date());await db.query('commit');
        expect(claim).toMatchObject({rewards:{stars:5},stage:{claimed:1,opened:3}});
      } finally {db.release();}
      const next=(await fetchAchievementCatalogueForUser(pool,userId)).find(a=>a.id==='fans-support');
      expect(next).toMatchObject({isClaimable:true,stage:{current:3,progressValue:20,targetValue:20}});
      expect((await pool.query('select xp,experience from users where id=$1',[userId])).rows[0]).toMatchObject({xp:15,experience:15});
      const finished=(await fetchAchievementCatalogueForUser(pool,finishedId)).find(a=>a.id==='fans-support');
      expect(finished).toMatchObject({status:'claimed',isClaimable:false,stage:{current:7,total:7}});
      expect(finished!.stage!.history).toHaveLength(7);
      expect((await pool.query('select xp,experience from users where id=$1',[finishedId])).rows[0]).toMatchObject({xp:500,experience:500});
      expect((await pool.query("select tgenabled from pg_trigger where tgname='social_achievement_stage'")).rows[0]!.tgenabled).toBe('O');
      expect((await applyMigrations(pool,migrations)).applied).toEqual([]);
    } finally {await pool.end();await fs.rm(directory,{recursive:true,force:true});}
  });
});
