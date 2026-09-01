import { createPool } from '../db/pool.js';
import { backfillPlayoffScheduling } from './playoffScheduleBackfill.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Playoff schedule backfill is disabled in production');
}

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function positiveIntegerOption(name: string, fallback: number): number {
  const raw = optionValue(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const apply = process.argv.includes('--apply');
if (apply && process.env.PLAYOFF_SCHEDULE_BACKFILL !== '1') {
  throw new Error('Set PLAYOFF_SCHEDULE_BACKFILL=1 to use --apply');
}

const tournamentSlug = optionValue('--tournament');
if (tournamentSlug === undefined && !process.argv.includes('--all')) {
  throw new Error('Pass --tournament <slug> or --all');
}

const pool = createPool(databaseUrl);
try {
  const report = await backfillPlayoffScheduling(pool, {
    ...(tournamentSlug === undefined ? {} : { tournamentSlug }),
    now: new Date(),
    dryRun: !apply,
    readinessMinutes: positiveIntegerOption('--readiness', 5),
    plannedStartIntervalMinutes: positiveIntegerOption('--interval', 20),
  });
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...report }, null, 2));
  if (report.tournaments.some((tournament) => tournament.status === 'blocked')) {
    process.exitCode = 2;
  }
} finally {
  await pool.end();
}
