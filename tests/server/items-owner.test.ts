import { describe, expect, it } from 'vitest';
import { createTestApp, guest, owner } from '../helpers/testApp';

const valid = { title: 'Fountain pen', description: 'Blue ink please', url: 'https://shop.example/pen', priceMinor: 12900, currency: 'USD' };

function setup() {
  const t = createTestApp();
  const create = async (body: unknown = valid) => t.call('/api/items', { as: owner, json: body });
  return { t, create };
}

function seedClaim(t: ReturnType<typeof createTestApp>, itemId: number, userId: number, lang: 'ru' | 'en' = 'en') {
  const round = (t.db.prepare("SELECT id FROM rounds WHERE status='open'").get() as { id: number }).id;
  t.db.prepare("INSERT INTO claims(item_id, round_id, user_id, user_name, kind, lang) VALUES (?, ?, ?, 'Zed <b>', 'full', ?)").run(itemId, round, userId, lang);
}

describe('owner item management', () => {
  it('forbids guests on create, update and delete', async () => {
    const { t, create } = setup();
    const id = (await (await create()).json()).id;
    for (const [path, method, json] of [
      ['/api/items', 'POST', valid],
      [`/api/items/${id}`, 'PATCH', { title: 'x' }],
      [`/api/items/${id}`, 'DELETE', undefined],
    ] as const) {
      const res = await t.call(path, { as: guest(1), method, json });
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(await res.json()).toEqual({ error: 'forbidden' });
    }
  });

  it('creates an item and answers 201 with the dto and without claim keys', async () => {
    const { create } = setup();
    const res = await create();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ title: 'Fountain pen', priceMinor: 12900, currency: 'USD', status: 'published', imageUrl: null, groupFunding: false });
    expect(body).not.toHaveProperty('claims');
    expect(body).not.toHaveProperty('funding');
  });

  it.each([
    ['empty title', { ...valid, title: '  ' }],
    ['price without currency', { title: 'x', priceMinor: 100 }],
    ['currency without price', { title: 'x', currency: 'USD' }],
    ['currency outside CURRENCIES', { title: 'x', priceMinor: 100, currency: 'JPY' }],
    ['javascript: url', { title: 'x', url: 'javascript:alert(1)' }],
    ['non-integer price', { title: 'x', priceMinor: 10.5, currency: 'USD' }],
    ['zero price', { title: 'x', priceMinor: 0, currency: 'USD' }],
    ['unknown field', { title: 'x', status: 'draft' }],
    ['too long title', { title: 'x'.repeat(201) }],
  ])('rejects %s with 400', async (_n, body) => {
    const { create } = setup();
    const res = await create(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_body' });
  });

  it('PATCH changes only the provided fields and bumps updated_at', async () => {
    const { t, create } = setup();
    const created = await (await create()).json();
    t.clock.set('2027-01-11T09:00:00Z');
    const res = await t.call(`/api/items/${created.id}`, { as: owner, method: 'PATCH', json: { title: 'Better pen' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ title: 'Better pen', description: 'Blue ink please', priceMinor: 12900, currency: 'USD' });
    const row = t.db.prepare('SELECT updated_at, created_at FROM items WHERE id = ?').get(created.id) as { updated_at: string; created_at: string };
    expect(row.updated_at).toBe('2027-01-11T09:00:00.000Z');
    expect(row.created_at).not.toBe(row.updated_at);
  });

  it('PATCH can clear the price and currency together with null, but not only one of them', async () => {
    const { t, create } = setup();
    const id = (await (await create()).json()).id;
    expect((await t.call(`/api/items/${id}`, { as: owner, method: 'PATCH', json: { currency: null } })).status).toBe(400);
    const ok = await t.call(`/api/items/${id}`, { as: owner, method: 'PATCH', json: { priceMinor: null, currency: null } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ priceMinor: null, currency: null });
  });

  it('answers 404 for PATCH and DELETE of a missing item', async () => {
    const { t } = setup();
    expect((await t.call('/api/items/999', { as: owner, method: 'PATCH', json: { title: 'x' } })).status).toBe(404);
    expect((await t.call('/api/items/999', { as: owner, method: 'DELETE' })).status).toBe(404);
  });

  it('never leaks claims in owner responses, whether or not the item is reserved', async () => {
    const { t, create } = setup();
    const free = await (await create()).json();
    const taken = await (await create({ ...valid, title: 'Other' })).json();
    seedClaim(t, taken.id, 2001);
    const bodies = [
      await (await t.call(`/api/items/${free.id}`, { as: owner, method: 'PATCH', json: { note: undefined, title: 'A' } })).text(),
      await (await t.call(`/api/items/${taken.id}`, { as: owner, method: 'PATCH', json: { title: 'A' } })).text(),
    ];
    for (const b of bodies) {
      expect(b).not.toMatch(/claims|funding|Zed|2001/);
    }
    expect(Object.keys(JSON.parse(bodies[0]!)).sort()).toEqual(Object.keys(JSON.parse(bodies[1]!)).sort());
  });

  it('DELETE answers identically for a reserved and a free item, and tells the claimer in their language, HTML-escaped', async () => {
    const { t, create } = setup();
    const free = await (await create()).json();
    const taken = await (await create({ ...valid, title: 'Lamp <i>' })).json();
    seedClaim(t, taken.id, 2001, 'ru');
    const a = await t.call(`/api/items/${free.id}`, { as: owner, method: 'DELETE' });
    const b = await t.call(`/api/items/${taken.id}`, { as: owner, method: 'DELETE' });
    expect([a.status, await a.text()]).toEqual([b.status, await b.clone().text()]);
    expect(t.notifier.sent).toHaveLength(1);
    expect(t.notifier.sent[0]).toMatchObject({ userId: 2001 });
    expect(t.notifier.sent[0]!.html).toContain('Lamp &lt;i&gt;');
    expect(t.notifier.sent[0]!.html).toMatch(/Подарок/);
    expect(t.db.prepare('SELECT COUNT(*) c FROM claims').get()).toEqual({ c: 0 });
  });

  it('DELETE succeeds even when the claimer cannot be notified', async () => {
    const { t, create } = setup();
    const taken = await (await create()).json();
    seedClaim(t, taken.id, 2001);
    t.notifier.failFor.add(2001);
    expect((await t.call(`/api/items/${taken.id}`, { as: owner, method: 'DELETE' })).status).toBe(200);
  });
});
