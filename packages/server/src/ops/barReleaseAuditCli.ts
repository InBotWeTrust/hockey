import {ENGINE_VERSION} from '@hockey/game-core';
import {loadMigrationConfig} from '../config.js';
import {loadDotEnv} from '../env.js';
import {createPool} from '../db/pool.js';
import {createPrivateOchko} from '../bar/games/ochkoDeck.js';

loadDotEnv();
const pool=createPool(loadMigrationConfig().DATABASE_URL);
async function main():Promise<void>{
 const client=await pool.connect();
 try {
  await client.query('begin read only');
  const settings=await client.query<{key:string;value:unknown}>("select key,value from game_settings where key in ('duels.fights.enabled','duels.fights.runtime.enabled') order by key");
  const games=await client.query(`select data->'runtime'->>'engineVersion' as engine,
    coalesce(data->'runtime'->'game'->'series'->>'totalRounds','4') as deals,
    ended_at is null as active,count(*)::int as count
    from bar_game_matches where kind='ochko' and character='grigory'
    group by 1,2,3 order by 1,2,3`);
  await client.query('commit');
  const newGame=createPrivateOchko(0);
  const deals=newGame.series?.totalRounds??4;
  console.log('[bar-release]',JSON.stringify({engine:ENGINE_VERSION,newGrigoryDeals:deals,settings:settings.rows,existingGrigoryGames:games.rows}));
  if(deals!==5)throw new Error('New Grigory games must contain five deals');
  if(settings.rows.find(row=>row.key==='duels.fights.enabled')?.value!==true)throw new Error('Ordinary duel fights are not enabled');
 } finally {client.release();await pool.end();}
}
main().catch(()=>{console.error('[bar-release] verification failed');process.exitCode=1;});
