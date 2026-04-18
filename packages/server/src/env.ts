import { readFileSync } from 'node:fs';
import path from 'node:path';

// Loads key=value pairs from the repo-root .env into process.env without
// overriding values already set. Silent no-op if the file is missing (prod
// and CI supply env externally).
export function loadDotEnv(candidatePaths: string[] = defaultCandidates()): void {
  for (const file of candidatePaths) {
    try {
      const content = readFileSync(file, 'utf-8');
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
      return;
    } catch {
      // try next candidate
    }
  }
}

function defaultCandidates(): string[] {
  return [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '../../.env')];
}
