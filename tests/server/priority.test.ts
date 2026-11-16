import { describe, expect, it } from 'vitest';
import { createTestApp, guest, owner } from '../helpers/testApp';

const make = (t: ReturnType<typeof createTestApp>, body: object) => t.call('/api/items', { as: owner, json: body });

describe('priority and notes', () => {
  it('defaults to want with an empty note', async () => {
    const t = createTestApp();
    expect(await (await make(t, { title: 'A' })).json()).toMatchObject({ priority: 'want', note: '' });
  });

  it('stores priority and note on create and update', async () => {
    const t = createTestApp();
    const a = await (await make(t, { title: 'A', priority: 'must', note: 'size M\nblue' })).json();
    expect(a).toMatchObject({ priority: 'must', note: 'size M\nblue' });
    const b = await (await t.call(`/api/items/${a.id}`, { as: owner, method: 'PATCH', json: { priority: 'nice', note: '' } })).json();
    expect(b).toMatchObject({ priority: 'nice', note: '' });
  });

  it('rejects an unknown priority and a note over 500 characters', async () => {
    const t = createTestApp();
    expect((await make(t, { title: 'A', priority: 'urgent' })).status).toBe(400);
    expect((await make(t, { title: 'A', note: 'x'.repeat(501) })).status).toBe(400);
    expect((await make(t, { title: 'A', note: 'x'.repeat(500) })).status).toBe(201);
  });

  it('sorts must, then want, then nice, newest first inside a group — the same for owner and guest', async () => {
    const t = createTestApp();
    const ids: Record<string, number> = {};
    for (const [name, priority] of [['nice1', 'nice'], ['want1', 'want'], ['must1', 'must'], ['want2', 'want'], ['must2', 'must']] as const) {
      ids[name] = (await (await make(t, { title: name, priority })).json()).id;
      t.clock.set(new Date(t.clock.now.getTime() + 1000));
    }
    const expected = ['must2', 'must1', 'want2', 'want1', 'nice1'].map((n) => ids[n]);
    for (const as of [owner, guest(1)]) {
      const list = (await (await t.call('/api/items', { as })).json()) as { id: number }[];
      expect(list.map((i) => i.id)).toEqual(expected);
    }
  });

  it('a reservation does not change the order a guest sees', async () => {
    const t = createTestApp();
    const a = await (await make(t, { title: 'A', priority: 'must' })).json();
    await make(t, { title: 'B', priority: 'want' });
    const before = ((await (await t.call('/api/items', { as: guest(2) })).json()) as { id: number }[]).map((i) => i.id);
    await t.call(`/api/items/${a.id}/claim`, { as: guest(1), method: 'POST' });
    const after = ((await (await t.call('/api/items', { as: guest(2) })).json()) as { id: number }[]).map((i) => i.id);
    expect(after).toEqual(before);
  });
});
