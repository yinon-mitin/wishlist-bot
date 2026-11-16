import { afterEach, describe, expect, it } from 'vitest';
import { ask, initDataRaw, openTelegramLink, startParam, tgUser } from '../../src/web/tg';

type Win = { Telegram?: { WebApp?: unknown } };
const w = window as unknown as Win;
const original = w.Telegram;
afterEach(() => {
  w.Telegram = original;
});

describe('Telegram bridge reads the live window.Telegram.WebApp', () => {
  it('initDataRaw, tgUser and startParam come from the object Telegram injected', () => {
    w.Telegram = {
      WebApp: { initData: 'auth_date=1&hash=x', initDataUnsafe: { user: { id: 5, language_code: 'ru' }, start_param: 'item_9' } },
    };
    expect(initDataRaw()).toBe('auth_date=1&hash=x');
    expect(tgUser()?.language_code).toBe('ru');
    expect(startParam()).toBe('item_9');
  });

  it('is empty, not a crash, outside Telegram', () => {
    w.Telegram = undefined;
    expect(initDataRaw()).toBe('');
    expect(tgUser()).toBeUndefined();
    expect(startParam()).toBeNull();
  });

  it('ask uses the native dialog when Telegram has one', async () => {
    w.Telegram = { WebApp: { isVersionAtLeast: () => true, showConfirm: (_m: string, cb: (ok: boolean) => void) => cb(true) } };
    expect(await ask('Sure?')).toBe(true);
  });

  it('openTelegramLink goes through Telegram', () => {
    const opened: string[] = [];
    w.Telegram = { WebApp: { openTelegramLink: (u: string) => opened.push(u) } };
    openTelegramLink('https://t.me/x');
    expect(opened).toEqual(['https://t.me/x']);
  });
});
