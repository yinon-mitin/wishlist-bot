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
import { runBackup } from './services/backup';
import { Scheduler } from './services/scheduler';

async function main() {
  const config = loadConfig(process.env);
  const db = openDb(join(config.dataDir, 'wishlist.sqlite'));
  const version = migrate(db);
  ensureOpenRound(db, config, new Date());
  const clock = () => new Date();
  let backup: () => Promise<boolean> = async () => false;
  const bot = createBot(config, undefined, { backup: () => backup() });
  const notifier = new GrammyNotifier(bot.api);
  const rates = new RatesService(db, new ErApiProvider(), clock, [...new Set([...config.currencies, 'USD'])]);
  const scheduler = new Scheduler(clock, config.timezone);
  void rates.refresh();
  scheduler.every(12 * 3600_000, () => rates.refresh());
  const deps: AppDeps = { config, db, clock, rates, notifier };
  backup = () => runBackup(deps);
  scheduler.dailyAt(config.backupHour, () => backup());
  const app = createApp(deps);

  void setupBot(bot, config);
  void bot.start({ allowed_updates: ['message'], onStart: (me) => console.log(`bot @${me.username} polling`) }).catch((err) => console.error('[bot] stopped:', err instanceof Error ? err.message : err));

  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`wishlist listening on :${info.port} (schema v${version})`);
  });

  const stop = () => {
    scheduler.stop();
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
