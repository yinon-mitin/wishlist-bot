import { describe, expect, it } from 'vitest';
import { convertMinor, formatMoney, toMinor } from '../../src/shared/money';
import type { Rates } from '../../src/shared/types';

const rates: Rates = { base: 'USD', rates: { USD: 1, RUB: 90, ILS: 3.6, EUR: 0.9 }, fetchedAt: '2027-01-01T00:00:00Z' };

describe('toMinor', () => {
  it('parses a space-grouped comma-decimal price', () => expect(toMinor('1 299,50')).toBe(129950));
  it('parses a comma-grouped dot-decimal price', () => expect(toMinor('1,299.50')).toBe(129950));
  it('parses a plain integer', () => expect(toMinor('1299')).toBe(129900));
  it('parses non-breaking-space grouping', () => expect(toMinor('1 299,5')).toBe(129950));
  it('treats a lone separator before exactly three digits as grouping', () => expect(toMinor('1,299')).toBe(129900));
  it('returns null for text and symbols', () => {
    expect(toMinor('abc')).toBeNull();
    expect(toMinor('₽ 100')).toBeNull();
    expect(toMinor('')).toBeNull();
    expect(toMinor('-5')).toBeNull();
  });
});

describe('convertMinor', () => {
  it('converts USD to RUB', () => expect(convertMinor(10000, 'USD', 'RUB', rates)).toBe(900000));
  it('goes through USD for RUB to ILS and rounds to whole minor units', () => {
    expect(convertMinor(9000, 'RUB', 'ILS', rates)).toBe(360);
    expect(convertMinor(1, 'RUB', 'ILS', rates)).toBe(0);
    expect(convertMinor(13, 'RUB', 'ILS', rates)).toBe(1);
  });
  it('rounds half up', () => expect(convertMinor(25, 'USD', 'EUR', { ...rates, rates: { USD: 1, EUR: 0.5 } })).toBe(13));
  it('returns the same number for the same currency', () => expect(convertMinor(12345, 'RUB', 'RUB', rates)).toBe(12345));
  it('throws for an unknown currency', () => expect(() => convertMinor(1, 'USD', 'XXX', rates)).toThrow());
});

describe('formatMoney', () => {
  it('formats rubles in Russian', () => {
    const s = formatMoney(129950, 'RUB', 'ru').replace(/\s/g, ' ');
    expect(s).toContain('1 299,50');
    expect(s).toContain('₽');
  });
  it('formats dollars in English', () => expect(formatMoney(129950, 'USD', 'en')).toBe('$1,299.50'));
});
