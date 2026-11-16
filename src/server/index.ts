import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { loadConfig } from './config';
import { openDb } from './db/db';
import { migrate } from './db/migrate';
import type { AppDeps, Notifier, RatesSource } from './deps';
import { ensureOpenRound } from './domain/rounds';
import { createApp } from './http/app';

// Placeholders until the real services land (rates, bot notifier).
const noopNotifier: Notifier = { send: async () => false, sendDocument: async () => false };
const noRates: RatesSource = { get: () => null, refresh: async () => false };

async function main() {
  const config = loadConfig(process.env);
  const db = openDb(join(config.dataDir, 'wishlist.sqlite'));
  const version = migrate(db);
  ensureOpenRound(db, config, new Date());
  const deps: AppDeps = { config, db, clock: () => new Date(), rates: noRates, notifier: noopNotifier };
  const app = createApp(deps);

  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`wishlist listening on :${info.port} (schema v${version})`);
  });

  const stop = () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
