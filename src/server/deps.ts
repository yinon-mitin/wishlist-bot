import type { Db } from './db/db';
import type { Config } from './config';
import type { Rates, Viewer } from '../shared/types';
import type { SafeFetch } from './services/ssrf';

export type Clock = () => Date;

export interface Notifier {
  /** Sends an HTML message. Returns false when delivery failed (e.g. the user blocked the bot). */
  send(userId: number, html: string): Promise<boolean>;
  sendDocument(userId: number, path: string, caption: string): Promise<boolean>;
}

export interface RatesSource {
  get(): Rates | null;
  refresh(): Promise<boolean>;
}

export interface AppDeps {
  config: Config;
  db: Db;
  clock: Clock;
  rates: RatesSource;
  notifier: Notifier;
  /** SSRF-safe fetcher for user-supplied URLs; tests inject a fake. */
  safeFetcher?: SafeFetch;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export type AppEnv = { Variables: { viewer: Viewer } };
