import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createBot, setupBot } from './bot/bot';
import { GrammyNotifier } from './bot/notifier';
import { loadConfig } from './config';
import { openDb } from './db/db';
import { migrate } from './db/migrate';
import type { AppDeps } from './deps';
import { ensureOpenRound } from './domain/rounds';
import { createApp } from './http/app';
import { ErApiProvider, RatesService } from './services/rates';

async function main() {
  const config = loadConfig(process.env);
  const db = openDb(join(config.dataDir, 'wishlist.sqlite'));
  const version = migrate(db);
  ensureOpenRound(db, config, new Date());
  const bot = createBot(config);
  const notifier = new GrammyNotifier(bot.api);
  const clock = () => new Date();
  const rates = new RatesService(db, new ErApiProvider(), clock, [...new Set([...config.currencies, 'USD'])]);
  void rates.refresh(); // scheduled refresh arrives with the scheduler
  const deps: AppDeps = { config, db, clock, rates, notifier };
  const app = createApp(deps);

  void setupBot(bot, config);
  void bot.start({ allowed_updates: ['message'], onStart: (me) => console.log(`bot @${me.username} polling`) }).catch((err) => console.error('[bot] stopped:', err instanceof Error ? err.message : err));

  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`wishlist listening on :${info.port} (schema v${version})`);
  });

  const stop = () => {
    void bot.stop();
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
