import { describe, expect, it } from 'vitest';
import { openDb } from '../../src/server/db/db';
import { migrate } from '../../src/server/db/migrate';
import { ErApiProvider, RatesService, type RateProvider } from '../../src/server/services/rates';
import { createTestApp, guest } from '../helpers/testApp';

const NOW = new Date('2027-01-10T12:00:00Z');
const db = () => {
  const d = openDb(':memory:');
  migrate(d);
  return d;
};
const provider = (rates: Record<string, number> | Error): RateProvider => ({
  fetchRates: async () => {
    if (rates instanceof Error) throw rates;
    return rates;
  },
});
const full = { USD: 1, RUB: 90, ILS: 3.6, EUR: 0.9, GBP: 0.8, JPY: 150 };

describe('RatesService', () => {
  it('stores only the wanted currencies and USD:1', async () => {
    const s = new RatesService(db(), provider(full), () => NOW, ['RUB', 'ILS']);
    expect(await s.refresh()).toBe(true);
    expect(s.get()).toEqual({ base: 'USD', rates: { USD: 1, RUB: 90, ILS: 3.6 }, fetchedAt: NOW.toISOString() });
  });

  it('keeps the previous cache when the network fails', async () => {
    const d = db();
    const ok = new RatesService(d, provider(full), () => NOW, ['RUB']);
    await ok.refresh();
    const bad = new RatesService(d, provider(new Error('offline')), () => NOW, ['RUB']);
    expect(await bad.refresh()).toBe(false);
    expect(bad.get()?.rates.RUB).toBe(90);
  });

  it('does not overwrite the cache when a wanted currency is missing', async () => {
    const d = db();
    const s = new RatesService(d, provider(full), () => NOW, ['RUB', 'ILS']);
    await s.refresh();
    const s2 = new RatesService(d, provider({ USD: 1, RUB: 100 }), () => NOW, ['RUB', 'ILS']);
    expect(await s2.refresh()).toBe(false);
    expect(s2.get()?.rates.RUB).toBe(90);
  });

  it('rejects non-positive and non-numeric rates', async () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      const s = new RatesService(db(), provider({ ...full, RUB: bad }), () => NOW, ['RUB']);
      expect(await s.refresh()).toBe(false);
      expect(s.get()).toBeNull();
    }
  });

  it('reads the cache from the database after a restart', async () => {
    const d = db();
    await new RatesService(d, provider(full), () => NOW, ['RUB']).refresh();
    const restarted = new RatesService(d, provider(new Error('offline')), () => NOW, ['RUB']);
    expect(restarted.get()?.rates.RUB).toBe(90);
  });
});

describe('ErApiProvider', () => {
  it('parses the open.er-api.com payload', async () => {
    const fetchImpl = (async () => Response.json({ result: 'success', base_code: 'USD', rates: full })) as unknown as typeof fetch;
    expect(await new ErApiProvider(fetchImpl).fetchRates()).toEqual(full);
  });
  it('throws on an error payload and on a bad status', async () => {
    const err = (async () => Response.json({ result: 'error' })) as unknown as typeof fetch;
    await expect(new ErApiProvider(err).fetchRates()).rejects.toThrow();
    const http = (async () => new Response('no', { status: 500 })) as unknown as typeof fetch;
    await expect(new ErApiProvider(http).fetchRates()).rejects.toThrow();
  });
});

describe('GET /api/rates', () => {
  it('returns 503 rates_unavailable until a cache exists, then the rates', async () => {
    const d = db();
    const rates = new RatesService(d, provider(full), () => NOW, ['RUB', 'ILS', 'USD', 'EUR']);
    const t = createTestApp({ deps: { rates } });
    const before = await t.call('/api/rates', { as: guest(1) });
    expect(before.status).toBe(503);
    expect(await before.json()).toEqual({ error: 'rates_unavailable' });
    await rates.refresh();
    const after = await t.call('/api/rates', { as: guest(1) });
    expect(after.status).toBe(200);
    expect((await after.json()).rates.RUB).toBe(90);
  });
});
