import { expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import { reconcileBestEffort } from '../../src/plugins/tournamentLifecycle.js';
const mocks = vi.hoisted(() => ({run: vi.fn(), enabled: vi.fn().mockResolvedValue(true), missing: vi.fn().mockResolvedValue(undefined)}));
vi.mock('../../src/tournament/automaticLifecycle.js',()=>({reconcileTournamentLifecycle:mocks.run}));
vi.mock('../../src/tournament/service.js',()=>({isTournamentFeatureEnabled:mocks.enabled}));
vi.mock('../../src/tournament/playoffSeriesLifecycle.js',()=>({reconcileMissingPlayoffSeriesGames:mocks.missing}));
it('shares concurrent maintenance for the same tournament without caching completed results', async () => {
 mocks.enabled.mockResolvedValue(true);
 mocks.missing.mockResolvedValue(undefined);
 let release!: (value: unknown) => void;
 mocks.run.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;})).mockResolvedValue({failures:[],items:[]});
 const options={pool:{} as Pool,log:{error:vi.fn()} as unknown as FastifyBaseLogger,classicSeedSecret:'test',tournamentId:'one'};
 const first=reconcileBestEffort({...options,shareInFlight:true}), second=reconcileBestEffort({...options,shareInFlight:true});
 await vi.waitFor(()=>expect(mocks.run).toHaveBeenCalled());
 const calls=mocks.run.mock.calls.length;
 release({failures:[],items:[]});
 await Promise.all([first,second]);
 expect(calls).toBe(1);
 await reconcileBestEffort({...options,shareInFlight:true});
 expect(mocks.run).toHaveBeenCalledTimes(2);
});

it('does not merge post-mutation reconciliation into an earlier read scan', async () => {
 mocks.enabled.mockResolvedValue(true);
 mocks.missing.mockResolvedValue(undefined);
 let release!: (value: unknown) => void;
 mocks.run.mockReset().mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;})).mockResolvedValue({failures:[],items:[]});
 const options={pool:{} as Pool,log:{error:vi.fn()} as unknown as FastifyBaseLogger,classicSeedSecret:'test',tournamentId:'one'};
 const first=reconcileBestEffort({...options,shareInFlight:true});
 await vi.waitFor(()=>expect(mocks.run).toHaveBeenCalledTimes(1));
 const afterWrite=reconcileBestEffort(options);
 await new Promise(resolve=>setTimeout(resolve,0));
 const calls=mocks.run.mock.calls.length;
 release({failures:[],items:[]});
 await Promise.all([first,afterWrite]);
 expect(calls).toBe(2);
});
