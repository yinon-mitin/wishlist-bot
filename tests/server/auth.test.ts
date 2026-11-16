import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { verifyInitData } from '../../src/server/auth/initData';
import { authMiddleware } from '../../src/server/auth/middleware';
import { errorHandler } from '../../src/server/http/errors';
import type { AppEnv } from '../../src/server/deps';
import { signInitData } from '../helpers/initData';

const TOKEN = '123456:TEST-TOKEN';
const NOW = new Date('2027-03-01T12:00:00Z');
const user = { id: 7, first_name: 'Anna', last_name: 'Petrova', language_code: 'ru' };
const sign = (over: Partial<Parameters<typeof signInitData>[0]> = {}) =>
  signInitData({ botToken: TOKEN, user, authDate: NOW, ...over });

describe('verifyInitData', () => {
  it('returns the user for a valid signature', () => {
    expect(verifyInitData(sign(), TOKEN, NOW, 3600)).toEqual({ id: 7, name: 'Anna Petrova', lang: 'ru' });
  });

  it('rejects a tampered field', () => {
    const p = new URLSearchParams(sign());
    p.set('user', JSON.stringify({ ...user, id: 99 }));
    expect(verifyInitData(p.toString(), TOKEN, NOW, 3600)).toBeNull();
  });

  it('rejects a missing hash', () => {
    const p = new URLSearchParams(sign());
    p.delete('hash');
    expect(verifyInitData(p.toString(), TOKEN, NOW, 3600)).toBeNull();
  });

  it('rejects a signature made with another token', () => {
    expect(verifyInitData(sign({ botToken: '1:other' }), TOKEN, NOW, 3600)).toBeNull();
  });

  it('rejects an auth_date older than the limit', () => {
    const old = sign({ authDate: new Date(NOW.getTime() - 3601_000) });
    expect(verifyInitData(old, TOKEN, NOW, 3600)).toBeNull();
  });

  it('rejects an auth_date more than 60 seconds in the future', () => {
    expect(verifyInitData(sign({ authDate: new Date(NOW.getTime() + 61_000) }), TOKEN, NOW, 3600)).toBeNull();
    expect(verifyInitData(sign({ authDate: new Date(NOW.getTime() + 30_000) }), TOKEN, NOW, 3600)).not.toBeNull();
  });

  it('returns null for an empty string and garbage without throwing', () => {
    expect(verifyInitData('', TOKEN, NOW, 3600)).toBeNull();
    expect(verifyInitData('%%%not-a-query%%%', TOKEN, NOW, 3600)).toBeNull();
    expect(verifyInitData('hash=zz&auth_date=abc&user={', TOKEN, NOW, 3600)).toBeNull();
  });

  it('maps language_code ru to ru and everything else to en', () => {
    expect(verifyInitData(sign({ user: { ...user, language_code: 'uk' } }), TOKEN, NOW, 3600)?.lang).toBe('en');
    expect(verifyInitData(sign({ user: { id: 7, first_name: 'A' } }), TOKEN, NOW, 3600)?.lang).toBe('en');
  });
});

describe('authMiddleware', () => {
  const deps = { config: { botToken: TOKEN, ownerId: 99, initDataMaxAgeSec: 3600 }, clock: () => NOW } as never;
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.use('/api/*', authMiddleware(deps));
  app.get('/api/who', (c) => c.json(c.get('viewer')));

  it('rejects a request without the header with 401', async () => {
    const res = await app.request('/api/who');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('rejects a signature made with another token', async () => {
    const res = await app.request('/api/who', { headers: { Authorization: `tma ${sign({ botToken: '1:x' })}` } });
    expect(res.status).toBe(401);
  });

  it('accepts a valid header and marks a regular guest', async () => {
    const res = await app.request('/api/who', { headers: { Authorization: `tma ${sign()}` } });
    expect(await res.json()).toEqual({ id: 7, name: 'Anna Petrova', lang: 'ru', isOwner: false });
  });

  it('marks OWNER_ID as owner', async () => {
    const res = await app.request('/api/who', { headers: { Authorization: `tma ${sign({ user: { id: 99, first_name: 'Boss' } })}` } });
    expect((await res.json()).isOwner).toBe(true);
  });
});
