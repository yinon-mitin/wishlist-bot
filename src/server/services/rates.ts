import type { Db } from '../db/db';
import type { Clock, RatesSource } from '../deps';
import type { Rates } from '../../shared/types';

export interface RateProvider {
  /** Units of each currency per 1 USD. */
  fetchRates(): Promise<Record<string, number>>;
}

/** open.er-api.com: free, no key, daily updates (attribution required, see README). */
export class ErApiProvider implements RateProvider {
  constructor(private fetchImpl: typeof fetch = fetch) {}

  async fetchRates(): Promise<Record<string, number>> {
    const res = await this.fetchImpl('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Rates provider answered ${res.status}`);
    const body = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (body.result !== 'success' || !body.rates) throw new Error('Rates provider returned an error payload');
    return body.rates;
  }
}

export class RatesService implements RatesSource {
  private cache: Rates | null | undefined;

  constructor(
    private db: Db,
    private provider: RateProvider,
    private clock: Clock,
    private wanted: string[],
  ) {}

  get(): Rates | null {
    if (this.cache === undefined) {
      const row = this.db.prepare("SELECT payload_json FROM rates WHERE base = 'USD'").get() as { payload_json: string } | undefined;
      this.cache = row ? (JSON.parse(row.payload_json) as Rates) : null;
    }
    return this.cache;
  }

  async refresh(): Promise<boolean> {
    try {
      const fetched = await this.provider.fetchRates();
      const rates: Record<string, number> = { USD: 1 };
      for (const code of this.wanted) {
        if (code === 'USD') continue;
        const v = fetched[code];
        if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return false;
        rates[code] = v;
      }
      const next: Rates = { base: 'USD', rates, fetchedAt: this.clock().toISOString() };
      this.db
        .prepare("INSERT INTO rates(base, payload_json, fetched_at) VALUES ('USD', ?, ?) ON CONFLICT(base) DO UPDATE SET payload_json = excluded.payload_json, fetched_at = excluded.fetched_at")
        .run(JSON.stringify(next), next.fetchedAt);
      this.cache = next;
      return true;
    } catch (err) {
      console.warn('[rates] refresh failed:', err instanceof Error ? err.message : err);
      return false;
    }
  }
}
