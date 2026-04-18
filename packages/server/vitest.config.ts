import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    testTimeout: 20000,
    // Integration tests share TEST_DATABASE_URL / TEST_REDIS_URL — run files
    // sequentially to avoid schema resets racing with concurrent queries.
    fileParallelism: false,
  },
});
