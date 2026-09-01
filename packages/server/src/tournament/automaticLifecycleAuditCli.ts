import { createPool } from '../db/pool.js';
import { auditAutomaticTournamentLifecycle } from './automaticLifecycleAudit.js';

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

const apply = process.argv.includes('--apply');
const tournamentSlug = optionValue('--tournament');
const all = process.argv.includes('--all');
if ((tournamentSlug === undefined && !all) || (tournamentSlug !== undefined && all)) {
  throw new Error('Pass exactly one of --tournament <slug> or --all');
}
if (
  apply &&
  (process.env.DEPLOYMENT_ENV !== 'dev' || process.env.TOURNAMENT_LIFECYCLE_RECONCILE !== '1')
) {
  throw new Error(
    '--apply requires DEPLOYMENT_ENV=dev and TOURNAMENT_LIFECYCLE_RECONCILE=1',
  );
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = createPool(databaseUrl);
try {
  let tournamentId: string | undefined;
  if (tournamentSlug !== undefined) {
    const tournament = await pool.query<{ id: string }>(
      `select id from tournament where slug = $1 and published_revision_id is not null`,
      [tournamentSlug],
    );
    tournamentId = tournament.rows[0]?.id;
    if (tournamentId === undefined) throw new Error('published tournament was not found');
  }
  const report = await auditAutomaticTournamentLifecycle(pool, {
    ...(tournamentId === undefined ? {} : { tournamentId }),
    now: new Date(),
    apply,
  });
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...report }, null, 2));
  if (report.tournaments.some((tournament) => tournament.status === 'blocked')) {
    process.exitCode = 2;
  }
} finally {
  await pool.end();
}
