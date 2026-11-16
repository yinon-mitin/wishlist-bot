import { describe, expect, it } from 'vitest';
import { createTestApp, guest, owner } from '../helpers/testApp';

async function setup() {
  const t = createTestApp();
  const draft = await (await t.call('/api/items', { as: owner, json: { title: 'Secret idea', status: 'draft' } })).json();
  const live = await (await t.call('/api/items', { as: owner, json: { title: 'Public' } })).json();
  return { t, draft, live };
}

describe('hidden drafts', () => {
  it('creates a draft that only the owner can see', async () => {
    const { t, draft, live } = await setup();
    expect(draft.status).toBe('draft');
    expect(live.status).toBe('published');
    const ownerList = (await (await t.call('/api/items', { as: owner })).json()) as { id: number; status: string }[];
    expect(ownerList.map((i) => [i.id, i.status]).sort()).toEqual([[draft.id, 'draft'], [live.id, 'published']].sort());
    const guestList = (await (await t.call('/api/items', { as: guest(1) })).json()) as { id: number }[];
    expect(guestList.map((i) => i.id)).toEqual([live.id]);
  });

  it('answers a guest asking for a draft exactly like for a non-existent item', async () => {
    const { t, draft } = await setup();
    const a = await t.call(`/api/items/${draft.id}`, { as: guest(1) });
    const b = await t.call('/api/items/99999', { as: guest(1) });
    expect([a.status, await a.text()]).toEqual([b.status, await b.text()]);
    expect(a.status).toBe(404);
  });

  it('does not let a guest reserve a draft', async () => {
    const { t, draft } = await setup();
    const res = await t.call(`/api/items/${draft.id}/claim`, { as: guest(1), method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('publishes with one action, idempotently', async () => {
    const { t, draft } = await setup();
    const first = await t.call(`/api/items/${draft.id}/publish`, { as: owner, method: 'POST' });
    expect(first.status).toBe(200);
    expect((await first.json()).status).toBe('published');
    expect((await t.call(`/api/items/${draft.id}/publish`, { as: owner, method: 'POST' })).status).toBe(200);
    expect((await t.call(`/api/items/${draft.id}`, { as: guest(1) })).status).toBe(200);
  });

  it('forbids guests on publish and answers 404 for a missing item', async () => {
    const { t, draft } = await setup();
    expect((await t.call(`/api/items/${draft.id}/publish`, { as: guest(1), method: 'POST' })).status).toBe(403);
    expect((await t.call('/api/items/9999/publish', { as: owner, method: 'POST' })).status).toBe(404);
  });

  it('rejects an unknown status on create and does not accept status in PATCH', async () => {
    const t = createTestApp();
    expect((await t.call('/api/items', { as: owner, json: { title: 'x', status: 'received' } })).status).toBe(400);
    const item = await (await t.call('/api/items', { as: owner, json: { title: 'x' } })).json();
    expect((await t.call(`/api/items/${item.id}`, { as: owner, method: 'PATCH', json: { status: 'draft' } })).status).toBe(400);
  });
});
