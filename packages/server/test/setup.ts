import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load root .env into process.env so integration tests can read TEST_DATABASE_URL
// and TEST_REDIS_URL without shell export. Silent no-op if .env is missing (CI
// should set vars explicitly).
const envPath = resolve(process.cwd(), '../../.env');
try {
  const content = readFileSync(envPath, 'utf-8');
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
} catch {
  // no .env — expected in CI or when vars are set externally
}
