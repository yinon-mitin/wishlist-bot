import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/server/config';

const base = { BOT_TOKEN: '123456:ABC', OWNER_ID: '42', PUBLIC_URL: 'https://mini.example.ts.net', BIRTHDAY: '03-14' };

describe('loadConfig', () => {
  it('fills defaults for a minimal env', () => {
    const c = loadConfig(base);
    expect(c.currencies).toEqual(['RUB', 'ILS', 'USD', 'EUR']);
    expect(c.defaultCurrency).toBe('RUB');
    expect(c.backupKeep).toBe(7);
    expect(c.backupHour).toBe(3);
    expect(c.initDataMaxAgeSec).toBe(86400);
    expect(c.ownerId).toBe(42);
    expect(c.port).toBe(8080);
  });

  it('reports every missing required variable in one error', () => {
    expect(() => loadConfig({ BIRTHDAY: '03-14' })).toThrowError(/BOT_TOKEN[\s\S]*OWNER_ID[\s\S]*PUBLIC_URL/);
  });

  it('rejects an invalid BIRTHDAY', () => {
    expect(() => loadConfig({ ...base, BIRTHDAY: '13-40' })).toThrowError(/BIRTHDAY/);
  });

  it('rejects a non-https PUBLIC_URL except localhost', () => {
    expect(() => loadConfig({ ...base, PUBLIC_URL: 'http://example.com' })).toThrowError(/PUBLIC_URL/);
    expect(loadConfig({ ...base, PUBLIC_URL: 'http://localhost:8080' }).publicUrl).toBe('http://localhost:8080');
  });

  it('rejects a DEFAULT_CURRENCY outside CURRENCIES', () => {
    expect(() => loadConfig({ ...base, CURRENCIES: 'USD,EUR', DEFAULT_CURRENCY: 'RUB' })).toThrowError(/DEFAULT_CURRENCY/);
  });

  it('rejects an unsupported currency', () => {
    expect(() => loadConfig({ ...base, CURRENCIES: 'USD,JPY' })).toThrowError(/JPY/);
  });
});
