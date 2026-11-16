import { describe, expect, it } from 'vitest';
import { createTestApp, guest, owner } from '../helpers/testApp';

const SECRET_NAME = 'SecretSanta99';
const SECRET_ID = 2111;
const LEAK = /SecretSanta|2111|"claims"|"funding"|already_claimed|reserved|taken/i;

async function world() {
  const t = createTestApp();
  const mk = async (title: string, extra: object = {}) =>
    (await (await t.call('/api/items', { as: owner, json: { title, priceMinor: 5000, currency: 'USD', ...extra } })).json()) as { id: number };
  const free = await mk('Gift A');
  const taken = await mk('Gift B');
  const takenToo = await mk('Gift C');
  const sneaky = { id: SECRET_ID, name: SECRET_NAME, lang: 'en' as const };
  for (const item of [taken, takenToo]) {
    const res = await t.call(`/api/items/${item.id}/claim`, { as: sneaky, method: 'POST' });
    expect(res.status).toBe(200);
  }
  return { t, free, taken, takenToo };
}

describe('guest views', () => {
  it('shows a guest the claims with names, and marks only their own as mine', async () => {
    const { t, taken, free } = await world();
    const other = await (await t.call(`/api/items/${taken.id}`, { as: guest(1) })).json();
    expect(other.claims).toEqual([{ userId: SECRET_ID, name: SECRET_NAME, kind: 'full', amountMinor: null, mine: false }]);
    const mineView = await (await t.call(`/api/items/${taken.id}`, { as: { id: SECRET_ID, name: SECRET_NAME } })).json();
    expect(mineView.claims[0].mine).toBe(true);
    const freeView = await (await t.call(`/api/items/${free.id}`, { as: guest(1) })).json();
    expect(freeView.claims).toEqual([]);
  });

  it('claims through the API, releases, and handles conflicts', async () => {
    const { t, free } = await world();
    const a = await t.call(`/api/items/${free.id}/claim`, { as: guest(1), method: 'POST' });
    expect(a.status).toBe(200);
    expect((await a.json()).claims[0]).toMatchObject({ name: 'Guest1', mine: true });
    const b = await t.call(`/api/items/${free.id}/claim`, { as: guest(2), method: 'POST' });
    expect(b.status).toBe(409);
    expect(await b.json()).toEqual({ error: 'already_claimed' });
    const rel = await t.call(`/api/items/${free.id}/claim`, { as: guest(1), method: 'DELETE' });
    expect((await rel.json()).claims).toEqual([]);
  });

  it('lists only published items for guests, newest first, regardless of claims', async () => {
    const { t, free, taken, takenToo } = await world();
    const ids = ((await (await t.call('/api/items', { as: guest(1) })).json()) as { id: number }[]).map((i) => i.id);
    expect(ids).toEqual([takenToo.id, taken.id, free.id]);
  });

  it('answers 404 for a missing item', async () => {
    const { t } = await world();
    expect((await t.call('/api/items/9999', { as: guest(1) })).status).toBe(404);
    expect((await t.call('/api/items/abc', { as: guest(1) })).status).toBe(404);
  });
});

describe('the owner never sees claims (core invariant)', () => {
  it('no owner response on any route contains claim data, names, ids or reservation hints', async () => {
    const { t, free, taken, takenToo } = await world();
    const seen: { what: string; res: Response }[] = [];
    const as = owner;
    seen.push({ what: 'me', res: await t.call('/api/me', { as }) });
    seen.push({ what: 'list', res: await t.call('/api/items', { as }) });
    for (const id of [free.id, taken.id, takenToo.id]) {
      seen.push({ what: `get ${id}`, res: await t.call(`/api/items/${id}`, { as }) });
      seen.push({ what: `claim ${id}`, res: await t.call(`/api/items/${id}/claim`, { as, method: 'POST' }) });
      seen.push({ what: `release ${id}`, res: await t.call(`/api/items/${id}/claim`, { as, method: 'DELETE' }) });
      seen.push({ what: `patch ${id}`, res: await t.call(`/api/items/${id}`, { as, method: 'PATCH', json: { title: 'renamed' } }) });
    }
    seen.push({ what: 'create', res: await t.call('/api/items', { as, json: { title: 'new' } }) });
    seen.push({ what: 'delete taken', res: await t.call(`/api/items/${taken.id}`, { as, method: 'DELETE' }) });
    seen.push({ what: 'delete free', res: await t.call(`/api/items/${free.id}`, { as, method: 'DELETE' }) });
    seen.push({ what: 'rates', res: await t.call('/api/rates', { as }) });
    for (const { what, res } of seen) {
      const body = await res.text();
      expect(body, what).not.toMatch(LEAK);
      expect(res.headers.get('etag'), what).toBeNull();
      expect(res.headers.get('last-modified'), what).toBeNull();
    }
  });

  it('a reserved and a free item look structurally identical to the owner', async () => {
    const { t, free, taken } = await world();
    const strip = (o: Record<string, unknown>) => {
      const { id: _i, title: _t, createdAt: _c, ...rest } = o;
      return rest;
    };
    const a = strip(await (await t.call(`/api/items/${free.id}`, { as: owner })).json());
    const b = strip(await (await t.call(`/api/items/${taken.id}`, { as: owner })).json());
    expect(b).toEqual(a);
  });

  it('the owner list is in the same order with and without reservations', async () => {
    const { t, free, taken, takenToo } = await world();
    const ids = ((await (await t.call('/api/items', { as: owner })).json()) as { id: number }[]).map((i) => i.id);
    expect(ids).toEqual([takenToo.id, taken.id, free.id]);
    await t.call(`/api/items/${free.id}/claim`, { as: guest(1), method: 'POST' });
    const after = ((await (await t.call('/api/items', { as: owner })).json()) as { id: number }[]).map((i) => i.id);
    expect(after).toEqual(ids);
  });

  it('the owner gets the same 403 trying to reserve a free and a taken item', async () => {
    const { t, free, taken } = await world();
    const a = await t.call(`/api/items/${free.id}/claim`, { as: owner, method: 'POST' });
    const b = await t.call(`/api/items/${taken.id}/claim`, { as: owner, method: 'POST' });
    expect([a.status, await a.text()]).toEqual([b.status, await b.text()]);
    expect(a.status).toBe(403);
  });
});

describe('/api/me', () => {
  it('returns the viewer and the public configuration', async () => {
    const t = createTestApp();
    const res = await t.call('/api/me', { as: guest(1, 'Dan', 'ru') });
    expect(await res.json()).toEqual({
      viewer: { id: 2001, name: 'Dan', lang: 'ru', isOwner: false },
      config: { currencies: ['RUB', 'ILS', 'USD', 'EUR'], defaultCurrency: 'RUB', birthday: '03-14', botUsername: 'wishlist_test_bot', appShortName: null },
    });
  });
  it('flags the owner', async () => {
    const t = createTestApp();
    expect((await (await t.call('/api/me', { as: owner })).json()).viewer.isOwner).toBe(true);
  });
});
