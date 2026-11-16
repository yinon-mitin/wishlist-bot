import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Lang } from '../../shared/types';

export interface TgUser {
  id: number;
  name: string;
  lang: Lang;
}

/**
 * Verifies Telegram WebApp initData: HMAC-SHA256 signature made with a key derived from the bot token,
 * plus freshness of auth_date. Returns null for anything that is not valid; never throws.
 */
export function verifyInitData(raw: string, botToken: string, now: Date, maxAgeSec: number): TgUser | null {
  try {
    if (!raw) return null;
    const params = new URLSearchParams(raw);
    const hash = params.get('hash');
    if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return null;
    params.delete('hash');

    const dcs = [...params.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expected = createHmac('sha256', secret).update(dcs).digest();
    const given = Buffer.from(hash, 'hex');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

    const authDate = Number(params.get('auth_date'));
    if (!Number.isFinite(authDate) || authDate <= 0) return null;
    const ageSec = now.getTime() / 1000 - authDate;
    if (ageSec > maxAgeSec || ageSec < -60) return null;

    const u = JSON.parse(params.get('user') ?? '') as { id?: unknown; first_name?: unknown; last_name?: unknown; username?: unknown; language_code?: unknown };
    if (typeof u.id !== 'number' || !Number.isSafeInteger(u.id)) return null;
    const first = typeof u.first_name === 'string' ? u.first_name : '';
    const last = typeof u.last_name === 'string' ? u.last_name : '';
    let name = `${first} ${last}`.trim();
    if (!name && typeof u.username === 'string') name = u.username;
    if (!name) name = `User ${u.id}`;
    return { id: u.id, name: name.slice(0, 100), lang: u.language_code === 'ru' ? 'ru' : 'en' };
  } catch {
    return null;
  }
}
