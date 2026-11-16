import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type AppOptions } from '../../src/server/http/app';
import { loadConfig, type Config } from '../../src/server/config';
import { openDb } from '../../src/server/db/db';
import { migrate } from '../../src/server/db/migrate';
import { ensureOpenRound } from '../../src/server/domain/rounds';
import type { AppDeps, Notifier, RatesSource } from '../../src/server/deps';
import type { Rates } from '../../src/shared/types';
import { signInitData } from './initData';

export const BOT_TOKEN = '123456:TEST-TOKEN';
export const OWNER_ID = 1000;

export interface TestUser {
  id: number;
  name: string;
  lang?: 'ru' | 'en';
}
export const owner: TestUser = { id: OWNER_ID, name: 'Owner Person' };
export const guest = (n: number, name = `Guest${n}`, lang: 'ru' | 'en' = 'en'): TestUser => ({ id: 2000 + n, name, lang });

export class FakeNotifier implements Notifier {
  sent: { userId: number; html: string }[] = [];
  docs: { userId: number; path: string; caption: string }[] = [];
  failFor = new Set<number>();
  async send(userId: number, html: string) {
    if (this.failFor.has(userId)) return false;
    this.sent.push({ userId, html });
    return true;
  }
  async sendDocument(userId: number, path: string, caption: string) {
    if (this.failFor.has(userId)) return false;
    this.docs.push({ userId, path, caption });
    return true;
  }
}

export class FakeRates implements RatesSource {
  constructor(public value: Rates | null = { base: 'USD', rates: { USD: 1, RUB: 90, ILS: 3.6, EUR: 0.9 }, fetchedAt: '2027-01-10T00:00:00.000Z' }) {}
  refreshed = 0;
  get() {
    return this.value;
  }
  async refresh() {
    this.refreshed++;
    return true;
  }
}

export interface TestClock {
  now: Date;
  fn: () => Date;
  set(d: Date | string): void;
}

export interface CallOpts {
  as?: TestUser | 'anon';
  method?: string;
  json?: unknown;
  body?: BodyInit;
  headers?: Record<string, string>;
}

export function createTestApp(overrides: { env?: Record<string, string>; app?: AppOptions; deps?: Partial<AppDeps> } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'wishlist-test-'));
  const config: Config = loadConfig({
    BOT_TOKEN,
    OWNER_ID: String(OWNER_ID),
    PUBLIC_URL: 'https://wishlist.example.ts.net',
    BIRTHDAY: '03-14',
    TIMEZONE: 'UTC',
    DATA_DIR: dataDir,
    BOT_USERNAME: 'wishlist_test_bot',
    ...overrides.env,
  });
  const db = openDb(':memory:');
  migrate(db);
  const clock: TestClock = {
    now: new Date('2027-01-10T12:00:00Z'),
    fn: () => clock.now,
    set(d) {
      clock.now = new Date(d);
    },
  };
  ensureOpenRound(db, config, clock.now);
  const notifier = new FakeNotifier();
  const rates = new FakeRates();
  const deps: AppDeps = { config, db, clock: clock.fn, rates, notifier, ...overrides.deps };
  const app = createApp(deps, overrides.app);

  async function call(path: string, opts: CallOpts = {}): Promise<Response> {
    const headers: Record<string, string> = { ...opts.headers };
    const as = opts.as ?? guest(1);
    if (as !== 'anon') {
      const initData = signInitData({
        botToken: BOT_TOKEN,
        user: { id: as.id, first_name: as.name, language_code: as.lang },
        authDate: clock.now,
      });
      headers['Authorization'] = `tma ${initData}`;
    }
    let body = opts.body;
    if (opts.json !== undefined) {
      body = JSON.stringify(opts.json);
      headers['Content-Type'] = 'application/json';
    }
    return app.request(path, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body });
  }

  return { app, db, clock, notifier, rates, config, deps, call, dataDir };
}
