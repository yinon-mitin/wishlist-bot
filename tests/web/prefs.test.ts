import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefs } from '../../src/web/tg';

afterEach(() => vi.restoreAllMocks());

describe('prefs', () => {
  it('stores and reads a value', async () => {
    await prefs.set('currency', 'ILS');
    expect(await prefs.get('currency')).toBe('ILS');
  });

  it('does not throw and returns null when storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await expect(prefs.set('currency', 'USD')).resolves.toBeUndefined();
    await expect(prefs.get('currency')).resolves.toBeNull();
  });
});
