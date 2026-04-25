import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { loadDotEnv } from './env.js';

loadDotEnv();

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ config });

  try {
    await app.listen({ host: config.HOST, port: config.PORT });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
