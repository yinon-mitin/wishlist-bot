import { describe, expect, it } from 'vitest';
import { createTestApp, guest, owner, type TestUser } from '../helpers/testApp';

async function world(extra: object = {}) {
  const t = createTestApp();
  const item = await (await t.call('/api/items', { as: owner, json: { title: 'Bike', priceMinor: 10000, currency: 'USD', groupFunding: true, ...extra } })).json();
  const give = (as: TestUser, amountMinor: unknown) => t.call(`/api/items/${item.id}/contribute`, { as, json: { amountMinor } });
  const view = async (as: TestUser = guest(9)) => (await t.call(`/api/items/${item.id}`, { as })).json();
  return { t, item, give, view };
}

describe('contributing', () => {
  it('accepts a contribution within the remainder and shows progress to guests', async () => {
    const { give, view } = await world();
    const res = await give(guest(1), 4000);
    expect(res.status).toBe(200);
    const v = await view();
    expect(v.funding).toEqual({ raisedMinor: 4000, remainingMinor: 6000 });
    expect(v.claims).toEqual([{ userId: 2001, name: 'Guest1', kind: 'share', amountMinor: 4000, mine: false }]);
  });

  it('rejects an amount above the remainder with 409 over_funded and records nothing', async () => {
    const { give, view } = await world();
    await give(guest(1), 6000);
    const res = await give(guest(2), 4001);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'over_funded' });
    expect((await view()).funding.raisedMinor).toBe(6000);
  });

  it('lets two contributions fill the gift exactly, and then nobody else can add', async () => {
    const { give, view } = await world();
    expect((await give(guest(1), 6000)).status).toBe(200);
    expect((await give(guest(2), 4000)).status).toBe(200);
    expect((await view()).funding).toEqual({ raisedMinor: 10000, remainingMinor: 0 });
    expect((await give(guest(3), 1)).status).toBe(409);
  });

  it('never lets the sum exceed the price over many sequential contributions', async () => {
    const { give, view } = await world();
    for (let n = 1; n <= 12; n++) await give(guest(n), 1500);
    const v = await view();
    expect(v.funding.raisedMinor).toBeLessThanOrEqual(10000);
    expect(v.funding.raisedMinor).toBe(9000); // six accepted, the rest refused
  });

  it.each([0, -5, 10.5, 'x', null, undefined])('rejects the amount %s with 400 invalid_amount', async (amount) => {
    const { give } = await world();
    const res = await give(guest(1), amount);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_amount' });
  });

  it('lets a guest change their own share, checking the limit against the others', async () => {
    const { give, view } = await world();
    await give(guest(1), 6000);
    await give(guest(2), 3000);
    expect((await give(guest(1), 7000)).status).toBe(200);
    expect((await give(guest(1), 7001)).status).toBe(409);
    expect((await give(guest(1), 1000)).status).toBe(200);
    const v = await view();
    expect(v.funding.raisedMinor).toBe(4000);
    expect(v.claims).toHaveLength(2); // still one row per guest
  });

  it('keeps full reservations and shares apart', async () => {
    const { t, item, give } = await world();
    await give(guest(1), 1000);
    const full = await t.call(`/api/items/${item.id}/claim`, { as: guest(2), method: 'POST' });
    expect(full.status).toBe(409);
    expect(await full.json()).toEqual({ error: 'already_claimed' });

    const w = await world();
    await w.t.call(`/api/items/${w.item.id}/claim`, { as: guest(1), method: 'POST' });
    const share = await w.give(guest(2), 1000);
    expect(share.status).toBe(409);
    expect(await share.json()).toEqual({ error: 'already_claimed' });
  });

  it('refuses contributions to a gift that is not group-funded', async () => {
    const t = createTestApp();
    const item = await (await t.call('/api/items', { as: owner, json: { title: 'Pen', priceMinor: 1000, currency: 'USD' } })).json();
    const res = await t.call(`/api/items/${item.id}/contribute`, { as: guest(1), json: { amountMinor: 100 } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'not_group_item' });
    expect((await (await t.call(`/api/items/${item.id}`, { as: guest(1) })).json()).funding).toBeUndefined();
  });

  it('answers 404 for a draft or a missing gift', async () => {
    const { t, give } = await world({ status: 'draft' });
    expect((await give(guest(1), 100)).status).toBe(404);
    expect((await t.call('/api/items/999/contribute', { as: guest(1), json: { amountMinor: 1 } })).status).toBe(404);
  });

  it('forbids the owner with the same 403 as for reservations', async () => {
    const { give } = await world();
    const res = await give(owner, 100);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'owner_cannot_claim' });
  });
});

describe('withdrawing', () => {
  it('lets only the author withdraw', async () => {
    const { t, item, give, view } = await world();
    await give(guest(1), 3000);
    expect((await t.call(`/api/items/${item.id}/contribute`, { as: guest(2), method: 'DELETE' })).status).toBe(403);
    expect((await t.call(`/api/items/${item.id}/contribute`, { as: guest(1), method: 'DELETE' })).status).toBe(200);
    expect((await view()).funding.raisedMinor).toBe(0);
  });

  it('is a no-op when there is nothing to withdraw', async () => {
    const { t, item } = await world();
    expect((await t.call(`/api/items/${item.id}/contribute`, { as: guest(1), method: 'DELETE' })).status).toBe(200);
  });
});

describe('the owner stays blind', () => {
  it('sees neither funding nor contributors anywhere', async () => {
    const { t, item, give } = await world();
    await give(guest(1, 'SecretSanta99'), 3000);
    for (const res of [
      await t.call(`/api/items/${item.id}`, { as: owner }),
      await t.call('/api/items', { as: owner }),
      await t.call(`/api/items/${item.id}`, { as: owner, method: 'PATCH', json: { title: 'Bike 2' } }),
      await t.call(`/api/items/${item.id}/contribute`, { as: owner, method: 'DELETE' }),
    ]) {
      expect(await res.text()).not.toMatch(/SecretSanta|funding|"claims"|raised|2001/);
    }
  });
});

describe('group funding setup', () => {
  it('requires a price', async () => {
    const t = createTestApp();
    const res = await t.call('/api/items', { as: owner, json: { title: 'Bike', groupFunding: true } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'price_required' });
  });

  it('refuses to clear the price of a group-funded gift', async () => {
    const { t, item } = await world();
    const res = await t.call(`/api/items/${item.id}`, { as: owner, method: 'PATCH', json: { priceMinor: null, currency: null } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'price_required' });
  });

  it('releases contributions silently (same answer for the owner) and tells contributors when group funding is switched off', async () => {
    const { t, item, give, view } = await world();
    await give(guest(1, 'Anna', 'ru'), 3000);
    const off = await t.call(`/api/items/${item.id}`, { as: owner, method: 'PATCH', json: { groupFunding: false } });
    expect(off.status).toBe(200);
    expect((await view()).claims).toEqual([]);
    expect(t.notifier.sent.map((m) => m.userId)).toEqual([2001]);
    expect(t.notifier.sent[0]!.html).toMatch(/Bike/);
    const plain = await world({ groupFunding: false });
    const a = Object.keys(await off.json()).sort();
    const b = Object.keys(await (await plain.t.call(`/api/items/${plain.item.id}`, { as: owner, method: 'PATCH', json: { title: 'x' } })).json()).sort();
    expect(a).toEqual(b);
  });

  it('releases contributions that no longer fit after the price is lowered or the currency changes', async () => {
    const lowered = await world();
    await lowered.give(guest(1), 6000);
    await lowered.t.call(`/api/items/${lowered.item.id}`, { as: owner, method: 'PATCH', json: { priceMinor: 5000 } });
    expect((await lowered.view()).funding).toEqual({ raisedMinor: 0, remainingMinor: 5000 });

    const kept = await world();
    await kept.give(guest(1), 4000);
    await kept.t.call(`/api/items/${kept.item.id}`, { as: owner, method: 'PATCH', json: { priceMinor: 5000 } });
    expect((await kept.view()).funding).toEqual({ raisedMinor: 4000, remainingMinor: 1000 });

    const recurrency = await world();
    await recurrency.give(guest(1), 4000);
    await recurrency.t.call(`/api/items/${recurrency.item.id}`, { as: owner, method: 'PATCH', json: { currency: 'EUR' } });
    expect((await recurrency.view()).funding).toEqual({ raisedMinor: 0, remainingMinor: 10000 });
  });
});
