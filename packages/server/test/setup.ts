import { loadDotEnv } from '../src/env.js';

// Pull TEST_DATABASE_URL / TEST_REDIS_URL from repo-root .env for local runs.
// In CI they come from the workflow env, so loadDotEnv is a no-op there.
loadDotEnv();
